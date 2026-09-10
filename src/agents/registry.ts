import { UnknownAgentError } from "./errors";
import type { AgentDefinition } from "./types";

const registry = new Map<string, AgentDefinition>();

/** Identity helper — exists for type inference at the call site, mirrors `defineTool`. */
export function defineAgent(definition: AgentDefinition): AgentDefinition {
  return definition;
}

export function registerAgent(agent: AgentDefinition): void {
  if (registry.has(agent.name)) {
    throw new Error(`Agent "${agent.name}" is already registered`);
  }
  const seen = new Set<string>();
  for (const tool of agent.tools) {
    if (seen.has(tool.name)) {
      throw new Error(`Duplicate tool "${tool.name}" on agent "${agent.name}"`);
    }
    seen.add(tool.name);
  }
  registry.set(agent.name, agent);
}

export function getAgent(name: string): AgentDefinition {
  const agent = registry.get(name);
  if (!agent) {
    throw new UnknownAgentError(name);
  }
  return agent;
}

export function listAgents(): AgentDefinition[] {
  return [...registry.values()];
}

/** Test-only escape hatch: registration is otherwise permanent for the process lifetime. */
export function _resetRegistryForTests(): void {
  registry.clear();
}
