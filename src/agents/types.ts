/**
 * Core types for the Akrasia agent orchestration substrate (AKR-8).
 *
 * An agent is defined in code as a name, a human-readable scope, and the
 * fixed list of tools it is permitted to call. Agents never touch the
 * database directly — they call tools through `AgentRunContext.callTool`,
 * which is the only path into `ToolDefinition.handler`. That's the
 * permission boundary: a tool not in `AgentDefinition.tools` cannot be
 * called by that agent, no matter what the agent code does.
 */

/** Everything a tool handler needs to know about who/what it's acting for. */
export interface ToolContext {
  readonly agentRunId: string;
  readonly operatorId: string;
  readonly propertyId: string;
}

export interface ToolDefinition<Input = unknown, Output = unknown> {
  /** Dot-namespaced, e.g. "dummy.echo". Unique within an agent's tool list. */
  name: string;
  description: string;
  /**
   * Money movement, access grants/revocations, external notifications — any
   * side effect that can't be undone by the substrate itself. Irreversible
   * tools never run inline: the call is logged as `pending_approval` and the
   * agent run halts until a human operator approves or rejects it.
   */
  irreversible: boolean;
  handler: (input: Input, ctx: ToolContext) => Promise<Output>;
}

export interface AgentRunContext {
  readonly agentRunId: string;
  readonly operatorId: string;
  readonly propertyId: string;
  /**
   * The only way agent code can take action. Throws `ToolNotPermittedError`
   * if `toolName` isn't in the calling agent's `tools`, and
   * `AwaitingApprovalError` if the tool is irreversible (the call was
   * logged, not executed).
   */
  callTool: <Input, Output>(toolName: string, input: Input) => Promise<Output>;
}

export interface AgentDefinition {
  /** Unique registry key, e.g. "smoke-test-agent". */
  name: string;
  description: string;
  /** Human-readable statement of this agent's permission boundary. */
  scope: string;
  /** The fixed set of tools this agent may call. Enforced at runtime. */
  tools: ToolDefinition<any, any>[];
  run: (ctx: AgentRunContext) => Promise<void>;
}

export type AgentRunStatus = "running" | "awaiting_approval" | "completed" | "failed" | "rejected";

export type AgentToolCallStatus = "pending_approval" | "completed" | "failed" | "rejected";

export interface AgentToolCallRecord {
  id: string;
  agentRunId: string;
  toolName: string;
  irreversible: boolean;
  status: AgentToolCallStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  requestedAt: Date;
  executedAt: Date | null;
  reviewedByOperatorId: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface AgentRunTrace {
  id: string;
  agentName: string;
  operatorId: string;
  propertyId: string;
  status: AgentRunStatus;
  input: unknown;
  error: string | null;
  startedAt: Date;
  endedAt: Date | null;
  toolCalls: AgentToolCallRecord[];
}

export interface AgentRunFilter {
  operatorId?: string;
  propertyId?: string;
}
