import { query } from "@/db/client";
import { UnknownToolCallError } from "./errors";
import type { NewAgentRun, NewAgentToolCall, ToolCallDecision, TraceStore } from "./store";
import type { AgentRunFilter, AgentRunStatus, AgentRunTrace, AgentToolCallRecord } from "./types";

interface AgentRunRow {
  id: string;
  agent_name: string;
  operator_id: string;
  property_id: string;
  status: AgentRunStatus;
  input: unknown;
  error: string | null;
  started_at: Date;
  ended_at: Date | null;
}

interface AgentToolCallRow {
  id: string;
  agent_run_id: string;
  tool_name: string;
  irreversible: boolean;
  status: AgentToolCallRecord["status"];
  input: unknown;
  output: unknown;
  error: string | null;
  requested_at: Date;
  executed_at: Date | null;
  reviewed_by_operator_id: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
}

function toRunTrace(row: AgentRunRow, toolCalls: AgentToolCallRecord[]): AgentRunTrace {
  return {
    id: row.id,
    agentName: row.agent_name,
    operatorId: row.operator_id,
    propertyId: row.property_id,
    status: row.status,
    input: row.input,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    toolCalls,
  };
}

function toToolCallRecord(row: AgentToolCallRow): AgentToolCallRecord {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    toolName: row.tool_name,
    irreversible: row.irreversible,
    status: row.status,
    input: row.input,
    output: row.output,
    error: row.error,
    requestedAt: row.requested_at,
    executedAt: row.executed_at,
    reviewedByOperatorId: row.reviewed_by_operator_id,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

async function loadToolCalls(agentRunId: string): Promise<AgentToolCallRecord[]> {
  const result = await query<AgentToolCallRow>(
    `SELECT * FROM agent_tool_call WHERE agent_run_id = $1 ORDER BY requested_at ASC`,
    [agentRunId],
  );
  return result.rows.map(toToolCallRecord);
}

/** Postgres-backed TraceStore. Tables land in migrations/1789056000000_create-agent-substrate.cjs. */
export class PgTraceStore implements TraceStore {
  async createAgentRun(run: NewAgentRun): Promise<AgentRunTrace> {
    const result = await query<AgentRunRow>(
      `INSERT INTO agent_run (id, agent_name, operator_id, property_id, input)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [run.id, run.agentName, run.operatorId, run.propertyId, JSON.stringify(run.input ?? {})],
    );
    return toRunTrace(result.rows[0], []);
  }

  async finishAgentRun(
    agentRunId: string,
    patch: { status: AgentRunStatus; error?: string },
  ): Promise<void> {
    await query(
      `UPDATE agent_run
       SET status = $2, error = $3, ended_at = now(), updated_at = now()
       WHERE id = $1`,
      [agentRunId, patch.status, patch.error ?? null],
    );
  }

  async logToolCall(call: NewAgentToolCall): Promise<AgentToolCallRecord> {
    const executedAt = call.status === "pending_approval" ? null : new Date();
    const result = await query<AgentToolCallRow>(
      `INSERT INTO agent_tool_call
         (id, agent_run_id, tool_name, irreversible, status, input, output, error, executed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        call.id,
        call.agentRunId,
        call.toolName,
        call.irreversible,
        call.status,
        JSON.stringify(call.input ?? {}),
        call.output === undefined ? null : JSON.stringify(call.output),
        call.error ?? null,
        executedAt,
      ],
    );
    return toToolCallRecord(result.rows[0]);
  }

  async decideToolCall(decision: ToolCallDecision): Promise<AgentToolCallRecord> {
    const executedAt = decision.status === "rejected" ? null : new Date();
    const result = await query<AgentToolCallRow>(
      `UPDATE agent_tool_call
       SET status = $2, output = $3, error = $4,
           reviewed_by_operator_id = $5, reviewed_at = now(), review_note = $6,
           executed_at = $7, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        decision.toolCallId,
        decision.status,
        decision.output === undefined ? null : JSON.stringify(decision.output),
        decision.error ?? null,
        decision.reviewedByOperatorId,
        decision.reviewNote ?? null,
        executedAt,
      ],
    );
    if (result.rows.length === 0) {
      throw new UnknownToolCallError(decision.toolCallId);
    }
    return toToolCallRecord(result.rows[0]);
  }

  async getToolCall(toolCallId: string): Promise<AgentToolCallRecord | null> {
    const result = await query<AgentToolCallRow>(`SELECT * FROM agent_tool_call WHERE id = $1`, [
      toolCallId,
    ]);
    return result.rows[0] ? toToolCallRecord(result.rows[0]) : null;
  }

  async getAgentRun(agentRunId: string): Promise<AgentRunTrace | null> {
    const result = await query<AgentRunRow>(`SELECT * FROM agent_run WHERE id = $1`, [agentRunId]);
    const row = result.rows[0];
    if (!row) return null;
    return toRunTrace(row, await loadToolCalls(agentRunId));
  }

  async listAgentRuns(filter: AgentRunFilter): Promise<AgentRunTrace[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter.operatorId) {
      params.push(filter.operatorId);
      conditions.push(`operator_id = $${params.length}`);
    }
    if (filter.propertyId) {
      params.push(filter.propertyId);
      conditions.push(`property_id = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await query<AgentRunRow>(
      `SELECT * FROM agent_run ${where} ORDER BY started_at DESC`,
      params,
    );
    return Promise.all(
      result.rows.map(async (row) => toRunTrace(row, await loadToolCalls(row.id))),
    );
  }

  async listPendingApprovals(filter: AgentRunFilter): Promise<AgentToolCallRecord[]> {
    const conditions: string[] = [`atc.status = 'pending_approval'`];
    const params: unknown[] = [];
    if (filter.operatorId) {
      params.push(filter.operatorId);
      conditions.push(`ar.operator_id = $${params.length}`);
    }
    if (filter.propertyId) {
      params.push(filter.propertyId);
      conditions.push(`ar.property_id = $${params.length}`);
    }
    const result = await query<AgentToolCallRow>(
      `SELECT atc.* FROM agent_tool_call atc
       JOIN agent_run ar ON ar.id = atc.agent_run_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY atc.requested_at DESC`,
      params,
    );
    return result.rows.map(toToolCallRecord);
  }

  async listConfirmationLog(filter: AgentRunFilter): Promise<AgentToolCallRecord[]> {
    const conditions: string[] = [`atc.irreversible = true`];
    const params: unknown[] = [];
    if (filter.operatorId) {
      params.push(filter.operatorId);
      conditions.push(`ar.operator_id = $${params.length}`);
    }
    if (filter.propertyId) {
      params.push(filter.propertyId);
      conditions.push(`ar.property_id = $${params.length}`);
    }
    const result = await query<AgentToolCallRow>(
      `SELECT atc.* FROM agent_tool_call atc
       JOIN agent_run ar ON ar.id = atc.agent_run_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY atc.requested_at DESC`,
      params,
    );
    return result.rows.map(toToolCallRecord);
  }
}
