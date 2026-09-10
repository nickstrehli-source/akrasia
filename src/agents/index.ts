import { registerAgent } from "./registry";
import { smokeTestAgent } from "./agents/smoke-test-agent";

registerAgent(smokeTestAgent);

export * from "./types";
export * from "./errors";
export type { TraceStore, NewAgentRun, NewAgentToolCall, ToolCallDecision } from "./store";
export { defineTool } from "./tool";
export { defineAgent, getAgent, listAgents, registerAgent } from "./registry";
export {
  runAgent,
  approveToolCall,
  rejectToolCall,
  getAgentRun,
  listAgentRuns,
  listPendingApprovals,
  listConfirmationLog,
} from "./runtime";
export { MemoryTraceStore } from "./store.memory";
export { PgTraceStore } from "./store.pg";
export { smokeTestAgent } from "./agents/smoke-test-agent";
