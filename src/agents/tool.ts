import type { ToolDefinition } from "./types";

/** Identity helper — exists for type inference at the call site, mirrors `defineAgent`. */
export function defineTool<Input, Output>(
  definition: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  return definition;
}
