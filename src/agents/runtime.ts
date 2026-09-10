import { randomUUID } from "node:crypto";
import {
  AwaitingApprovalError,
  ToolCallNotPendingError,
  ToolNotPermittedError,
  UnknownToolCallError,
} from "./errors";
import { getAgent } from "./registry";
import { PgTraceStore } from "./store.pg";
import type { TraceStore } from "./store";
import type {
  AgentRunContext,
  AgentRunFilter,
  AgentRunTrace,
  AgentToolCallRecord,
  ToolContext,
} from "./types";

let defaultStore: TraceStore | undefined;

function getDefaultStore(): TraceStore {
  if (!defaultStore) {
    defaultStore = new PgTraceStore();
  }
  return defaultStore;
}

export interface RunAgentParams {
  agentName: string;
  operatorId: string;
  propertyId: string;
  input?: unknown;
  store?: TraceStore;
}

/**
 * Runs one agent invocation start to end (or to an approval pause).
 *
 * Never throws for expected orchestration outcomes — a failed run, a
 * permission-boundary violation, or a pause for HITL approval all come back
 * as a trace with the corresponding `status`. Only unexpected store errors
 * (e.g. a lost DB connection) propagate as exceptions.
 */
export async function runAgent(params: RunAgentParams): Promise<AgentRunTrace> {
  const store = params.store ?? getDefaultStore();
  const agent = getAgent(params.agentName);
  const allowedTools = new Map(agent.tools.map((tool) => [tool.name, tool]));

  const run = await store.createAgentRun({
    id: randomUUID(),
    agentName: agent.name,
    operatorId: params.operatorId,
    propertyId: params.propertyId,
    input: params.input ?? {},
  });

  const toolContext: ToolContext = {
    agentRunId: run.id,
    operatorId: params.operatorId,
    propertyId: params.propertyId,
  };

  const ctx: AgentRunContext = {
    agentRunId: run.id,
    operatorId: params.operatorId,
    propertyId: params.propertyId,
    callTool: async (toolName, input) => {
      const tool = allowedTools.get(toolName);
      if (!tool) {
        const err = new ToolNotPermittedError(agent.name, toolName);
        await store.logToolCall({
          id: randomUUID(),
          agentRunId: run.id,
          toolName,
          irreversible: false,
          input,
          status: "failed",
          error: err.message,
        });
        throw err;
      }

      if (tool.irreversible) {
        const call = await store.logToolCall({
          id: randomUUID(),
          agentRunId: run.id,
          toolName: tool.name,
          irreversible: true,
          input,
          status: "pending_approval",
        });
        throw new AwaitingApprovalError(call.id, tool.name);
      }

      try {
        const output = await tool.handler(input, toolContext);
        await store.logToolCall({
          id: randomUUID(),
          agentRunId: run.id,
          toolName: tool.name,
          irreversible: false,
          input,
          status: "completed",
          output,
        });
        return output;
      } catch (err) {
        await store.logToolCall({
          id: randomUUID(),
          agentRunId: run.id,
          toolName: tool.name,
          irreversible: false,
          input,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };

  try {
    await agent.run(ctx);
    await store.finishAgentRun(run.id, { status: "completed" });
  } catch (err) {
    if (err instanceof AwaitingApprovalError) {
      await store.finishAgentRun(run.id, { status: "awaiting_approval" });
    } else {
      await store.finishAgentRun(run.id, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const trace = await store.getAgentRun(run.id);
  if (!trace) {
    throw new Error(`agent run ${run.id} vanished immediately after creation`);
  }
  return trace;
}

interface DecisionOpts {
  note?: string;
  store?: TraceStore;
}

/**
 * Human-in-the-loop approval: executes the gated tool for real and commits
 * its side effect, then marks the run `completed` (or `failed` if the
 * handler throws even on approval).
 *
 * Scope note: this substrate does not resume arbitrary agent code after a
 * pause — the approved tool call is the last step of the run. Multi-step
 * resumption is a follow-up for whenever a real multi-step workflow needs it.
 */
export async function approveToolCall(
  toolCallId: string,
  reviewerOperatorId: string,
  opts: DecisionOpts = {},
): Promise<AgentToolCallRecord> {
  const store = opts.store ?? getDefaultStore();
  const call = await requirePendingCall(store, toolCallId);
  const run = await requireRun(store, call.agentRunId);
  const tool = getAgent(run.agentName).tools.find((t) => t.name === call.toolName);
  if (!tool) {
    throw new ToolNotPermittedError(run.agentName, call.toolName);
  }

  const toolContext: ToolContext = {
    agentRunId: run.id,
    operatorId: run.operatorId,
    propertyId: run.propertyId,
  };

  try {
    const output = await tool.handler(call.input, toolContext);
    const decided = await store.decideToolCall({
      toolCallId,
      status: "completed",
      output,
      reviewedByOperatorId: reviewerOperatorId,
      reviewNote: opts.note,
    });
    await store.finishAgentRun(run.id, { status: "completed" });
    return decided;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const decided = await store.decideToolCall({
      toolCallId,
      status: "failed",
      error: message,
      reviewedByOperatorId: reviewerOperatorId,
      reviewNote: opts.note,
    });
    await store.finishAgentRun(run.id, { status: "failed", error: message });
    return decided;
  }
}

export async function rejectToolCall(
  toolCallId: string,
  reviewerOperatorId: string,
  opts: DecisionOpts = {},
): Promise<AgentToolCallRecord> {
  const store = opts.store ?? getDefaultStore();
  const call = await requirePendingCall(store, toolCallId);
  const decided = await store.decideToolCall({
    toolCallId,
    status: "rejected",
    reviewedByOperatorId: reviewerOperatorId,
    reviewNote: opts.note,
  });
  await store.finishAgentRun(call.agentRunId, { status: "rejected" });
  return decided;
}

async function requirePendingCall(
  store: TraceStore,
  toolCallId: string,
): Promise<AgentToolCallRecord> {
  const call = await store.getToolCall(toolCallId);
  if (!call) throw new UnknownToolCallError(toolCallId);
  if (call.status !== "pending_approval")
    throw new ToolCallNotPendingError(toolCallId, call.status);
  return call;
}

async function requireRun(store: TraceStore, agentRunId: string): Promise<AgentRunTrace> {
  const run = await store.getAgentRun(agentRunId);
  if (!run) throw new Error(`agent run "${agentRunId}" not found`);
  return run;
}

export async function getAgentRun(
  agentRunId: string,
  store: TraceStore = getDefaultStore(),
): Promise<AgentRunTrace | null> {
  return store.getAgentRun(agentRunId);
}

export async function listAgentRuns(
  filter: AgentRunFilter,
  store: TraceStore = getDefaultStore(),
): Promise<AgentRunTrace[]> {
  return store.listAgentRuns(filter);
}

export async function listPendingApprovals(
  filter: AgentRunFilter,
  store: TraceStore = getDefaultStore(),
): Promise<AgentToolCallRecord[]> {
  return store.listPendingApprovals(filter);
}
