import { UnknownToolCallError } from "./errors";
import type { NewAgentRun, NewAgentToolCall, ToolCallDecision, TraceStore } from "./store";
import type { AgentRunFilter, AgentRunTrace, AgentToolCallRecord } from "./types";

/** In-process TraceStore for unit tests. No persistence beyond the instance's lifetime. */
export class MemoryTraceStore implements TraceStore {
  private runs = new Map<string, AgentRunTrace>();
  private calls = new Map<string, AgentToolCallRecord>();

  async createAgentRun(run: NewAgentRun): Promise<AgentRunTrace> {
    const trace: AgentRunTrace = {
      id: run.id,
      agentName: run.agentName,
      operatorId: run.operatorId,
      propertyId: run.propertyId,
      status: "running",
      input: run.input,
      error: null,
      startedAt: new Date(),
      endedAt: null,
      toolCalls: [],
    };
    this.runs.set(trace.id, trace);
    return { ...trace, toolCalls: [] };
  }

  async finishAgentRun(
    agentRunId: string,
    patch: { status: AgentRunTrace["status"]; error?: string },
  ): Promise<void> {
    const run = this.runs.get(agentRunId);
    if (!run) return;
    run.status = patch.status;
    run.error = patch.error ?? null;
    run.endedAt = new Date();
  }

  async logToolCall(call: NewAgentToolCall): Promise<AgentToolCallRecord> {
    const record: AgentToolCallRecord = {
      id: call.id,
      agentRunId: call.agentRunId,
      toolName: call.toolName,
      irreversible: call.irreversible,
      status: call.status,
      input: call.input,
      output: call.output ?? null,
      error: call.error ?? null,
      requestedAt: new Date(),
      executedAt: call.status === "pending_approval" ? null : new Date(),
      reviewedByOperatorId: null,
      reviewedAt: null,
      reviewNote: null,
    };
    this.calls.set(record.id, record);
    return record;
  }

  async decideToolCall(decision: ToolCallDecision): Promise<AgentToolCallRecord> {
    const record = this.calls.get(decision.toolCallId);
    if (!record) throw new UnknownToolCallError(decision.toolCallId);
    record.status = decision.status;
    record.output = decision.output ?? null;
    record.error = decision.error ?? null;
    record.reviewedByOperatorId = decision.reviewedByOperatorId;
    record.reviewedAt = new Date();
    record.reviewNote = decision.reviewNote ?? null;
    record.executedAt = decision.status === "rejected" ? null : new Date();
    return record;
  }

  async getToolCall(toolCallId: string): Promise<AgentToolCallRecord | null> {
    return this.calls.get(toolCallId) ?? null;
  }

  async getAgentRun(agentRunId: string): Promise<AgentRunTrace | null> {
    const run = this.runs.get(agentRunId);
    if (!run) return null;
    return { ...run, toolCalls: this.toolCallsFor(agentRunId) };
  }

  async listAgentRuns(filter: AgentRunFilter): Promise<AgentRunTrace[]> {
    return [...this.runs.values()]
      .filter((run) => (filter.operatorId ? run.operatorId === filter.operatorId : true))
      .filter((run) => (filter.propertyId ? run.propertyId === filter.propertyId : true))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map((run) => ({ ...run, toolCalls: this.toolCallsFor(run.id) }));
  }

  async listPendingApprovals(filter: AgentRunFilter): Promise<AgentToolCallRecord[]> {
    const runIds = new Set((await this.listAgentRuns(filter)).map((run) => run.id));
    return [...this.calls.values()]
      .filter((call) => call.status === "pending_approval" && runIds.has(call.agentRunId))
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  async listConfirmationLog(filter: AgentRunFilter): Promise<AgentToolCallRecord[]> {
    const runIds = new Set((await this.listAgentRuns(filter)).map((run) => run.id));
    return [...this.calls.values()]
      .filter((call) => call.irreversible && runIds.has(call.agentRunId))
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  private toolCallsFor(agentRunId: string): AgentToolCallRecord[] {
    return [...this.calls.values()]
      .filter((call) => call.agentRunId === agentRunId)
      .sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
  }
}
