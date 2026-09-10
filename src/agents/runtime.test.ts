import { beforeEach, describe, expect, it } from "vitest";
import { _resetRegistryForTests, defineAgent, registerAgent } from "./registry";
import {
  approveToolCall,
  getAgentRun,
  listAgentRuns,
  listPendingApprovals,
  rejectToolCall,
  runAgent,
} from "./runtime";
import { MemoryTraceStore } from "./store.memory";
import { defineTool } from "./tool";

const OPERATOR = "operator-1";
const OTHER_OPERATOR = "operator-2";
const PROPERTY = "property-1";
const OTHER_PROPERTY = "property-2";

beforeEach(() => {
  _resetRegistryForTests();
});

describe("runAgent — reversible tools", () => {
  it("executes inline and records a completed trace", async () => {
    const store = new MemoryTraceStore();
    const double = defineTool<{ x: number }, { x: number }>({
      name: "math.double",
      description: "doubles x",
      irreversible: false,
      handler: async ({ x }) => ({ x: x * 2 }),
    });
    registerAgent(
      defineAgent({
        name: "doubler",
        description: "test",
        scope: "math.double only",
        tools: [double],
        run: async (ctx) => {
          await ctx.callTool("math.double", { x: 21 });
        },
      }),
    );

    const trace = await runAgent({
      agentName: "doubler",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });

    expect(trace.status).toBe("completed");
    expect(trace.operatorId).toBe(OPERATOR);
    expect(trace.propertyId).toBe(PROPERTY);
    expect(trace.startedAt).toBeInstanceOf(Date);
    expect(trace.endedAt).toBeInstanceOf(Date);
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]).toMatchObject({
      toolName: "math.double",
      irreversible: false,
      status: "completed",
      output: { x: 42 },
    });
  });

  it("records a failed trace when a reversible tool throws", async () => {
    const store = new MemoryTraceStore();
    const boom = defineTool<Record<string, never>, never>({
      name: "test.boom",
      description: "always throws",
      irreversible: false,
      handler: async () => {
        throw new Error("kaboom");
      },
    });
    registerAgent(
      defineAgent({
        name: "boomer",
        description: "test",
        scope: "test.boom only",
        tools: [boom],
        run: async (ctx) => {
          await ctx.callTool("test.boom", {});
        },
      }),
    );

    const trace = await runAgent({
      agentName: "boomer",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });

    expect(trace.status).toBe("failed");
    expect(trace.error).toContain("kaboom");
    expect(trace.toolCalls[0]).toMatchObject({
      status: "failed",
      error: expect.stringContaining("kaboom"),
    });
  });
});

describe("runAgent — permission boundary", () => {
  it("blocks a tool call the agent isn't scoped to and logs the attempt", async () => {
    const store = new MemoryTraceStore();
    const allowed = defineTool<Record<string, never>, { ok: true }>({
      name: "scope.allowed",
      description: "allowed",
      irreversible: false,
      handler: async () => ({ ok: true }),
    });
    registerAgent(
      defineAgent({
        name: "narrow-agent",
        description: "test",
        scope: "scope.allowed only",
        tools: [allowed],
        run: async (ctx) => {
          await ctx.callTool("scope.forbidden", {});
        },
      }),
    );

    const trace = await runAgent({
      agentName: "narrow-agent",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });

    expect(trace.status).toBe("failed");
    expect(trace.error).toMatch(/not permitted/i);
    expect(trace.toolCalls).toHaveLength(1);
    expect(trace.toolCalls[0]).toMatchObject({ toolName: "scope.forbidden", status: "failed" });
  });
});

describe("runAgent — HITL confirmation gate", () => {
  function registerGatedAgent(name: string, onExecute: () => void) {
    const notify = defineTool<{ message: string }, { sent: boolean }>({
      name: "gate.notify",
      description: "irreversible dummy notification",
      irreversible: true,
      handler: async ({ message }) => {
        onExecute();
        return { sent: true, message } as unknown as { sent: boolean };
      },
    });
    registerAgent(
      defineAgent({
        name,
        description: "test",
        scope: "gate.notify only",
        tools: [notify],
        run: async (ctx) => {
          await ctx.callTool("gate.notify", { message: "hi" });
        },
      }),
    );
  }

  it("halts the run without executing the tool until approved", async () => {
    const store = new MemoryTraceStore();
    let executed = 0;
    registerGatedAgent("gated-agent-approve", () => executed++);

    const trace = await runAgent({
      agentName: "gated-agent-approve",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });

    expect(trace.status).toBe("awaiting_approval");
    expect(executed).toBe(0);
    expect(trace.toolCalls).toHaveLength(1);
    const pending = trace.toolCalls[0];
    expect(pending.status).toBe("pending_approval");
    expect(pending.irreversible).toBe(true);

    const decided = await approveToolCall(pending.id, OPERATOR, { store });
    expect(executed).toBe(1);
    expect(decided.status).toBe("completed");
    expect(decided.reviewedByOperatorId).toBe(OPERATOR);
    expect(decided.reviewedAt).toBeInstanceOf(Date);

    const finalTrace = await getAgentRun(trace.id, store);
    expect(finalTrace?.status).toBe("completed");
    expect(finalTrace?.toolCalls[0].status).toBe("completed");
  });

  it("never executes a rejected tool call and ends the run as rejected", async () => {
    const store = new MemoryTraceStore();
    let executed = 0;
    registerGatedAgent("gated-agent-reject", () => executed++);

    const trace = await runAgent({
      agentName: "gated-agent-reject",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });
    const pending = trace.toolCalls[0];

    const decided = await rejectToolCall(pending.id, OPERATOR, { note: "not now", store });
    expect(executed).toBe(0);
    expect(decided.status).toBe("rejected");
    expect(decided.reviewNote).toBe("not now");

    const finalTrace = await getAgentRun(trace.id, store);
    expect(finalTrace?.status).toBe("rejected");
  });

  it("rejects deciding a call that isn't pending", async () => {
    const store = new MemoryTraceStore();
    registerGatedAgent("gated-agent-double-decide", () => {});
    const trace = await runAgent({
      agentName: "gated-agent-double-decide",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });
    const pending = trace.toolCalls[0];

    await approveToolCall(pending.id, OPERATOR, { store });
    await expect(approveToolCall(pending.id, OPERATOR, { store })).rejects.toThrow(
      /not pending approval/,
    );
  });
});

describe("trace queries", () => {
  it("filters runs and pending approvals by operator + property scope", async () => {
    const store = new MemoryTraceStore();
    const notify = defineTool<Record<string, never>, { sent: boolean }>({
      name: "scoped.notify",
      description: "irreversible",
      irreversible: true,
      handler: async () => ({ sent: true }),
    });
    registerAgent(
      defineAgent({
        name: "scoped-agent",
        description: "test",
        scope: "scoped.notify only",
        tools: [notify],
        run: async (ctx) => {
          await ctx.callTool("scoped.notify", {});
        },
      }),
    );

    await runAgent({
      agentName: "scoped-agent",
      operatorId: OPERATOR,
      propertyId: PROPERTY,
      store,
    });
    await runAgent({
      agentName: "scoped-agent",
      operatorId: OTHER_OPERATOR,
      propertyId: OTHER_PROPERTY,
      store,
    });

    const forOperator = await listAgentRuns({ operatorId: OPERATOR }, store);
    expect(forOperator).toHaveLength(1);
    expect(forOperator[0].operatorId).toBe(OPERATOR);

    const forProperty = await listAgentRuns({ propertyId: OTHER_PROPERTY }, store);
    expect(forProperty).toHaveLength(1);
    expect(forProperty[0].propertyId).toBe(OTHER_PROPERTY);

    const pendingForOperator = await listPendingApprovals({ operatorId: OPERATOR }, store);
    expect(pendingForOperator).toHaveLength(1);

    const pendingForOtherProperty = await listPendingApprovals(
      { propertyId: OTHER_PROPERTY },
      store,
    );
    expect(pendingForOtherProperty).toHaveLength(1);

    const pendingForMismatchedScope = await listPendingApprovals(
      { operatorId: OPERATOR, propertyId: OTHER_PROPERTY },
      store,
    );
    expect(pendingForMismatchedScope).toHaveLength(0);
  });
});
