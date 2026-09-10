import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { query } from "@/db/client";
import { registerAgent, _resetRegistryForTests } from "./registry";
import {
  approveToolCall,
  getAgentRun,
  listAgentRuns,
  listPendingApprovals,
  runAgent,
} from "./runtime";
import { PgTraceStore } from "./store.pg";
import { smokeTestAgent } from "./agents/smoke-test-agent";

/**
 * Postgres-backed smoke test for the agent substrate (AKR-8 acceptance
 * criteria: an agent invocation actually flows through, end to end,
 * against the real trace store). Skipped unless DATABASE_URL is set — the
 * `db` CI job runs this after `db:migrate:up` + `db:seed`; the `quality`
 * job (no Postgres service) skips it.
 */
describe.skipIf(!process.env.DATABASE_URL)("agent substrate — Postgres integration", () => {
  const store = new PgTraceStore();
  const operatorId = randomUUID();
  const propertyId = randomUUID();

  beforeAll(async () => {
    await query(`INSERT INTO operator (id, email, name) VALUES ($1, $2, $3)`, [
      operatorId,
      `akr8-smoke-${operatorId}@demo.akrasia.local`,
      "AKR-8 Smoke Test Operator",
    ]);
    await query(
      `INSERT INTO property
         (id, owner_operator_id, name, address_line1, city, region, postal_code, country)
       VALUES ($1, $2, 'AKR-8 Smoke Test Property', '1 Substrate Way', 'Austin', 'TX', '78701', 'US')`,
      [propertyId, operatorId],
    );
  });

  afterAll(async () => {
    await query(
      `DELETE FROM agent_tool_call WHERE agent_run_id IN (SELECT id FROM agent_run WHERE operator_id = $1)`,
      [operatorId],
    );
    await query(`DELETE FROM agent_run WHERE operator_id = $1`, [operatorId]);
    await query(`DELETE FROM property WHERE id = $1`, [propertyId]);
    await query(`DELETE FROM operator WHERE id = $1`, [operatorId]);
  });

  beforeEach(() => {
    _resetRegistryForTests();
    registerAgent(smokeTestAgent);
  });

  it("runs the dummy agent, persists a trace, gates the irreversible call, and commits on approval", async () => {
    const trace = await runAgent({
      agentName: "smoke-test-agent",
      operatorId,
      propertyId,
      store,
    });

    expect(trace.status).toBe("awaiting_approval");
    expect(trace.toolCalls).toHaveLength(2);
    expect(trace.toolCalls[0]).toMatchObject({ toolName: "dummy.echo", status: "completed" });
    const pending = trace.toolCalls[1];
    expect(pending).toMatchObject({
      toolName: "dummy.sendTestNotification",
      status: "pending_approval",
    });

    const pendingApprovals = await listPendingApprovals({ operatorId, propertyId }, store);
    expect(pendingApprovals.map((c) => c.id)).toContain(pending.id);

    await approveToolCall(pending.id, operatorId, { store, note: "approved by smoke test" });

    const finalTrace = await getAgentRun(trace.id, store);
    expect(finalTrace?.status).toBe("completed");
    expect(finalTrace?.toolCalls[1]).toMatchObject({
      status: "completed",
      output: { sent: true, message: "hello from the smoke test agent" },
      reviewedByOperatorId: operatorId,
    });

    const runsForScope = await listAgentRuns({ operatorId, propertyId }, store);
    expect(runsForScope.map((r) => r.id)).toContain(trace.id);

    const pendingAfterApproval = await listPendingApprovals({ operatorId, propertyId }, store);
    expect(pendingAfterApproval.map((c) => c.id)).not.toContain(pending.id);
  });
});
