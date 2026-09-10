export class UnknownAgentError extends Error {
  constructor(public readonly agentName: string) {
    super(`Unknown agent "${agentName}"`);
    this.name = "UnknownAgentError";
  }
}

export class UnknownToolError extends Error {
  constructor(public readonly toolName: string) {
    super(`Unknown tool "${toolName}"`);
    this.name = "UnknownToolError";
  }
}

export class UnknownToolCallError extends Error {
  constructor(public readonly toolCallId: string) {
    super(`Unknown tool call "${toolCallId}"`);
    this.name = "UnknownToolCallError";
  }
}

/** Thrown when an agent calls a tool outside its registered permission boundary. */
export class ToolNotPermittedError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly toolName: string,
  ) {
    super(`Agent "${agentName}" is not permitted to call tool "${toolName}"`);
    this.name = "ToolNotPermittedError";
  }
}

/**
 * Thrown by `callTool` for an irreversible tool. The call has already been
 * logged as `pending_approval` — this is control flow, not a failure — and
 * `runAgent` catches it to end the run in `awaiting_approval` status rather
 * than `failed`.
 */
export class AwaitingApprovalError extends Error {
  constructor(
    public readonly toolCallId: string,
    public readonly toolName: string,
  ) {
    super(`Tool call "${toolName}" (${toolCallId}) is awaiting operator approval`);
    this.name = "AwaitingApprovalError";
  }
}

export class ToolCallNotPendingError extends Error {
  constructor(
    public readonly toolCallId: string,
    public readonly status: string,
  ) {
    super(`Tool call "${toolCallId}" is not pending approval (status: ${status})`);
    this.name = "ToolCallNotPendingError";
  }
}
