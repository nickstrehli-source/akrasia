import { NextResponse } from "next/server";
import { getPool } from "@/db/client";

export type LogLevel = "error" | "warn" | "info";

export interface LogServerEventInput {
  level: LogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
  propertyId?: string | null;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Writes one row to `system_log` — the catch-all for server errors that
 * aren't already captured by the agent substrate (agent-loop and tool-call
 * failures live on `agent_run`/`agent_tool_call`; see
 * `src/lib/observability.ts` for the query that unions all three into one
 * searchable surface). Never throws: a logging failure must not take down
 * the request that triggered it.
 */
export async function logServerEvent(input: LogServerEventInput): Promise<void> {
  console.error(`[${input.level}] ${input.source}: ${input.message}`);
  try {
    await getPool().query(
      `INSERT INTO system_log (level, source, message, context, property_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.level,
        input.source,
        input.message,
        JSON.stringify(input.context ?? {}),
        input.propertyId ?? null,
      ],
    );
  } catch (err) {
    console.error(`system_log insert failed: ${errorMessage(err)}`);
  }
}

/**
 * Wraps a route handler so an error that escapes its own try/catch is
 * captured to `system_log` and turned into a generic 500 instead of an
 * unlogged default error response. Routes that already translate every
 * error they can throw into a typed response don't need this.
 */
export function withRouteErrorLogging<Args extends unknown[]>(
  source: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      await logServerEvent({ level: "error", source, message: errorMessage(err) });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
