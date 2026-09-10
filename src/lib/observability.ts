import { getPool } from "@/db/client";

export type LogSource = "system" | "agent_run" | "tool_call";

export interface LogEntry {
  id: string;
  source: LogSource;
  level: "error" | "warn" | "info";
  message: string;
  propertyId: string | null;
  createdAt: Date;
}

export interface HealthStats {
  runCount: number;
  failureCount: number;
  failureRate: number;
  meanDurationMs: number | null;
  p95DurationMs: number | null;
}

interface SystemLogRow {
  id: string;
  level: "error" | "warn" | "info";
  message: string;
  property_id: string | null;
  created_at: Date;
}

interface FailedRunRow {
  id: string;
  agent_name: string;
  property_id: string;
  error: string | null;
  started_at: Date;
}

interface FailedToolCallRow {
  id: string;
  tool_name: string;
  error: string | null;
  requested_at: Date;
  property_id: string;
}

/**
 * The single searchable log surface (AKR-10): server errors captured via
 * `logServerEvent` (`system_log`) merged with agent-loop failures
 * (`agent_run.status = 'failed'`) and tool-call failures
 * (`agent_tool_call.status = 'failed'`) — those two already carry their own
 * `error` column from the substrate built in AKR-8, so this reads them
 * rather than duplicating them into `system_log`. Merged and sorted in
 * application code instead of one UNION across differently-shaped tables.
 */
export async function listRecentLogEntries(limit = 100): Promise<LogEntry[]> {
  const pool = getPool();
  const [systemResult, runResult, callResult] = await Promise.all([
    pool.query<SystemLogRow>(
      `SELECT id, level, message, property_id, created_at
         FROM system_log
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    ),
    pool.query<FailedRunRow>(
      `SELECT id, agent_name, property_id, error, started_at
         FROM agent_run
        WHERE status = 'failed'
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    ),
    pool.query<FailedToolCallRow>(
      `SELECT atc.id, atc.tool_name, atc.error, atc.requested_at, ar.property_id
         FROM agent_tool_call atc
         JOIN agent_run ar ON ar.id = atc.agent_run_id
        WHERE atc.status = 'failed'
        ORDER BY atc.requested_at DESC
        LIMIT $1`,
      [limit],
    ),
  ]);

  const entries: LogEntry[] = [
    ...systemResult.rows.map((r) => ({
      id: r.id,
      source: "system" as const,
      level: r.level,
      message: r.message,
      propertyId: r.property_id,
      createdAt: r.created_at,
    })),
    ...runResult.rows.map((r) => ({
      id: r.id,
      source: "agent_run" as const,
      level: "error" as const,
      message: `agent "${r.agent_name}" run failed: ${r.error ?? "unknown error"}`,
      propertyId: r.property_id,
      createdAt: r.started_at,
    })),
    ...callResult.rows.map((r) => ({
      id: r.id,
      source: "tool_call" as const,
      level: "error" as const,
      message: `tool "${r.tool_name}" call failed: ${r.error ?? "unknown error"}`,
      propertyId: r.property_id,
      createdAt: r.requested_at,
    })),
  ];

  return entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

/** p50/p95 from a pre-sorted ascending array via nearest-rank. */
function percentile(sortedAsc: number[], p: number): number {
  const index = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length));
  return sortedAsc[index];
}

/**
 * Aggregate stats for the `/admin/health` page: run count, failure rate, and
 * mean/p95 duration over ended runs. All-time rather than windowed — the
 * demo's run volume is low enough that a time window would mostly show
 * "no data" (see AGENTS.md non-goals: no paid observability vendor).
 */
export async function getHealthStats(): Promise<HealthStats> {
  const { rows } = await getPool().query<{
    status: string;
    started_at: Date;
    ended_at: Date | null;
  }>(`SELECT status, started_at, ended_at FROM agent_run`);

  const runCount = rows.length;
  const failureCount = rows.filter((r) => r.status === "failed").length;
  const durationsMs = rows
    .filter((r): r is typeof r & { ended_at: Date } => r.ended_at !== null)
    .map((r) => r.ended_at.getTime() - r.started_at.getTime())
    .sort((a, b) => a - b);

  return {
    runCount,
    failureCount,
    failureRate: runCount === 0 ? 0 : failureCount / runCount,
    meanDurationMs:
      durationsMs.length === 0
        ? null
        : durationsMs.reduce((sum, d) => sum + d, 0) / durationsMs.length,
    p95DurationMs: durationsMs.length === 0 ? null : percentile(durationsMs, 0.95),
  };
}
