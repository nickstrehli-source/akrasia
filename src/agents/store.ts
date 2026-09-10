import type {
  AgentRunFilter,
  AgentRunStatus,
  AgentRunTrace,
  AgentToolCallRecord,
  AgentToolCallStatus,
} from "./types";

export interface NewAgentRun {
  id: string;
  agentName: string;
  operatorId: string;
  propertyId: string;
  input: unknown;
}

export interface NewAgentToolCall {
  id: string;
  agentRunId: string;
  toolName: string;
  irreversible: boolean;
  input: unknown;
  /** Reversible calls log their outcome (`completed`/`failed`) in one write; irreversible calls log `pending_approval`. */
  status: AgentToolCallStatus;
  output?: unknown;
  error?: string;
}

export interface ToolCallDecision {
  toolCallId: string;
  status: "completed" | "failed" | "rejected";
  reviewedByOperatorId: string;
  reviewNote?: string;
  output?: unknown;
  error?: string;
}

/**
 * Persistence boundary for the agent substrate. `PgTraceStore` is the real
 * implementation; `MemoryTraceStore` backs unit tests so orchestration logic
 * (permission boundary, HITL gate, status transitions) can be verified
 * without a live Postgres instance.
 */
export interface TraceStore {
  createAgentRun(run: NewAgentRun): Promise<AgentRunTrace>;
  finishAgentRun(
    agentRunId: string,
    patch: { status: AgentRunStatus; error?: string },
  ): Promise<void>;
  logToolCall(call: NewAgentToolCall): Promise<AgentToolCallRecord>;
  decideToolCall(decision: ToolCallDecision): Promise<AgentToolCallRecord>;
  getToolCall(toolCallId: string): Promise<AgentToolCallRecord | null>;
  getAgentRun(agentRunId: string): Promise<AgentRunTrace | null>;
  listAgentRuns(filter: AgentRunFilter): Promise<AgentRunTrace[]>;
  listPendingApprovals(filter: AgentRunFilter): Promise<AgentToolCallRecord[]>;
}
