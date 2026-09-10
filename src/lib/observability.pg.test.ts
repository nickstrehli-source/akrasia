import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { query } from "@/db/client";
import { getHealthStats, listRecentLogEntries } from "./observability";
import { logServerEvent } from "./log";

/**
 * Postgres-backed: exercises the real `system_log` table plus `agent_run` /
 * `agent_tool_call` failure rows, same convention as
 * `src/agents/runtime.pg.test.ts` — skipped unless DATABASE_URL is set.
 */
describe.skipIf(!process.env.DATABASE_URL)("observability", () => {
  const operatorId = randomUUID();
  const propertyId = randomUUID();
  const runId = randomUUID();
  const failedToolCallId = randomUUID();

  beforeAll(async () => {
    await query(`INSERT INTO operator (id, email, name) VALUES ($1, $2, $3)`, [
      operatorId,
      `akr10-obs-${operatorId}@demo.akrasia.local`,
      "AKR-10 Observability Test Operator",
    ]);
    await query(
      `INSERT INTO property
         (id, owner_operator_id, name, address_line1, city, region, postal_code, country)
       VALUES ($1, $2, 'AKR-10 Obs Test Property', '1 Observability Way', 'Austin', 'TX', '78701', 'US')`,
      [propertyId, operatorId],
    );
    await query(
      `INSERT INTO agent_run (id, agent_name, operator_id, property_id, status, error, ended_at)
       VALUES ($1, 'obs-test-agent', $2, $3, 'failed', 'boom', now())`,
      [runId, operatorId, propertyId],
    );
    await query(
      `INSERT INTO agent_tool_call
         (id, agent_run_id, tool_name, irreversible, status, input, error)
       VALUES ($1, $2, 'obs.failingTool', false, 'failed', '{}', 'tool boom')`,
      [failedToolCallId, runId],
    );
    await logServerEvent({
      level: "error",
      source: "obs-test",
      message: "synthetic system error",
      propertyId,
    });
  });

  afterAll(async () => {
    await query(`DELETE FROM system_log WHERE source = 'obs-test'`);
    await query(`DELETE FROM agent_tool_call WHERE id = $1`, [failedToolCallId]);
    await query(`DELETE FROM agent_run WHERE id = $1`, [runId]);
    await query(`DELETE FROM property WHERE id = $1`, [propertyId]);
    await query(`DELETE FROM operator WHERE id = $1`, [operatorId]);
  });

  it("merges system_log, failed agent runs, and failed tool calls into one sorted feed", async () => {
    const entries = await listRecentLogEntries(500);
    const bySource = Object.fromEntries(entries.map((e) => [e.id, e]));

    expect(bySource[runId]).toMatchObject({
      source: "agent_run",
      level: "error",
      propertyId,
    });
    expect(bySource[runId].message).toContain("boom");

    expect(bySource[failedToolCallId]).toMatchObject({
      source: "tool_call",
      level: "error",
      propertyId,
    });
    expect(bySource[failedToolCallId].message).toContain("tool boom");

    const systemEntry = entries.find((e) => e.source === "system" && e.propertyId === propertyId);
    expect(systemEntry?.message).toBe("synthetic system error");
  });

  it("computes run count, failure rate, and duration percentiles", async () => {
    const stats = await getHealthStats();
    expect(stats.runCount).toBeGreaterThanOrEqual(1);
    expect(stats.failureCount).toBeGreaterThanOrEqual(1);
    expect(stats.failureRate).toBeGreaterThan(0);
    expect(stats.failureRate).toBeLessThanOrEqual(1);
    expect(stats.meanDurationMs).not.toBeNull();
    expect(stats.p95DurationMs).not.toBeNull();
  });
});
