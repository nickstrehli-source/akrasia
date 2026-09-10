import { beforeEach, describe, expect, it } from "vitest";
import { _resetRegistryForTests, registerAgent } from "../registry";
import { approveToolCall, getAgentRun, runAgent } from "../runtime";
import { MemoryTraceStore } from "../store.memory";
import { smokeTestAgent } from "./smoke-test-agent";

beforeEach(() => {
  _resetRegistryForTests();
  registerAgent(smokeTestAgent);
});

describe("smoke-test-agent", () => {
  it("flows through the substrate: reversible call runs inline, irreversible call gates on approval", async () => {
    const store = new MemoryTraceStore();

    const trace = await runAgent({
      agentName: "smoke-test-agent",
      operatorId: "operator-1",
      propertyId: "property-1",
      store,
    });

    expect(trace.status).toBe("awaiting_approval");
    expect(trace.toolCalls).toHaveLength(2);
    expect(trace.toolCalls[0]).toMatchObject({
      toolName: "dummy.echo",
      status: "completed",
      output: { echoed: "SUBSTRATE ONLINE" },
    });
    const pending = trace.toolCalls[1];
    expect(pending).toMatchObject({
      toolName: "dummy.sendTestNotification",
      status: "pending_approval",
    });

    await approveToolCall(pending.id, "operator-1", { store });

    const finalTrace = await getAgentRun(trace.id, store);
    expect(finalTrace?.status).toBe("completed");
    expect(finalTrace?.toolCalls[1]).toMatchObject({
      status: "completed",
      output: { sent: true, message: "hello from the smoke test agent" },
      reviewedByOperatorId: "operator-1",
    });
  });
});
