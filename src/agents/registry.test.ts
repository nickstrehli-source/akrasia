import { beforeEach, describe, expect, it } from "vitest";
import { UnknownAgentError } from "./errors";
import {
  _resetRegistryForTests,
  defineAgent,
  getAgent,
  listAgents,
  registerAgent,
} from "./registry";
import { defineTool } from "./tool";

const noopTool = defineTool<{ x: number }, { x: number }>({
  name: "test.noop",
  description: "returns its input",
  irreversible: false,
  handler: async (input) => input,
});

beforeEach(() => {
  _resetRegistryForTests();
});

describe("agent registry", () => {
  it("registers and retrieves an agent by name", () => {
    const agent = defineAgent({
      name: "test-agent",
      description: "test",
      scope: "test.noop only",
      tools: [noopTool],
      run: async () => {},
    });
    registerAgent(agent);
    expect(getAgent("test-agent")).toBe(agent);
    expect(listAgents()).toEqual([agent]);
  });

  it("throws UnknownAgentError for an unregistered name", () => {
    expect(() => getAgent("does-not-exist")).toThrow(UnknownAgentError);
  });

  it("rejects re-registering the same agent name", () => {
    const agent = defineAgent({
      name: "dup-agent",
      description: "test",
      scope: "test.noop only",
      tools: [noopTool],
      run: async () => {},
    });
    registerAgent(agent);
    expect(() => registerAgent(agent)).toThrow(/already registered/);
  });

  it("rejects an agent with duplicate tool names", () => {
    const agent = defineAgent({
      name: "dup-tool-agent",
      description: "test",
      scope: "test.noop only",
      tools: [noopTool, noopTool],
      run: async () => {},
    });
    expect(() => registerAgent(agent)).toThrow(/Duplicate tool/);
  });
});
