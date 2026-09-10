import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { requirePropertyAccess, ForbiddenError } from "@/lib/auth/access";
import { getAgentRun } from "@/agents";
import type { AgentToolCallRecord } from "@/agents";
import { redactPii } from "@/lib/redact";

async function isScopedToProperty(operatorId: string, propertyId: string): Promise<boolean> {
  try {
    await requirePropertyAccess(operatorId, propertyId);
    return true;
  } catch (err) {
    if (err instanceof ForbiddenError) return false;
    throw err;
  }
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toolCallRow(call: AgentToolCallRecord, scoped: boolean) {
  const input = scoped ? call.input : redactPii(call.input);
  const output = scoped ? call.output : redactPii(call.output);
  return (
    <li
      key={call.id}
      style={{
        border: "1px solid #ddd",
        borderRadius: 4,
        padding: "0.75rem",
        marginBottom: "0.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{call.toolName}</strong>
        <span>
          {call.status}
          {call.irreversible ? " (irreversible)" : ""}
        </span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#555" }}>
        requested {call.requestedAt.toISOString()}
        {call.executedAt ? ` · executed ${call.executedAt.toISOString()}` : ""}
      </div>
      <details>
        <summary>input</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{json(input)}</pre>
      </details>
      {call.output !== null && (
        <details>
          <summary>output</summary>
          <pre style={{ whiteSpace: "pre-wrap" }}>{json(output)}</pre>
        </details>
      )}
      {call.error && <p style={{ color: "#a00" }}>error: {call.error}</p>}
      {call.reviewedByOperatorId && (
        <p style={{ fontSize: "0.85rem" }}>
          decided by {call.reviewedByOperatorId} at {call.reviewedAt?.toISOString()}
          {call.reviewNote ? ` — "${call.reviewNote}"` : ""}
        </p>
      )}
    </li>
  );
}

export default async function AgentRunTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionOperator(token);
  if (!session) {
    redirect("/login");
  }

  const run = await getAgentRun(id);
  if (!run) {
    notFound();
  }

  const scoped = await isScopedToProperty(session.operatorId, run.propertyId);
  const elapsedMs = run.endedAt ? run.endedAt.getTime() - run.startedAt.getTime() : null;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <p>
        <Link href="/dashboard/runs">&larr; Agent runs</Link>
      </p>
      <h1 style={{ fontSize: "1.5rem" }}>
        {run.agentName} · {run.status}
      </h1>
      <p style={{ fontSize: "0.9rem", color: "#555" }}>
        run {run.id} · property {run.propertyId} · started {run.startedAt.toISOString()}
        {run.endedAt ? ` · ended ${run.endedAt.toISOString()} (${elapsedMs}ms)` : " · in progress"}
      </p>
      {run.error && <p style={{ color: "#a00" }}>run error: {run.error}</p>}
      {!scoped && (
        <p style={{ background: "#fff3cd", padding: "0.5rem 0.75rem", borderRadius: 4 }}>
          You are not scoped to this run&apos;s property — tenant-identifying fields below are
          redacted.
        </p>
      )}

      <h2>Tool calls</h2>
      {run.toolCalls.length === 0 ? (
        <p>No tool calls.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {run.toolCalls.map((call) => toolCallRow(call, scoped))}
        </ul>
      )}
    </main>
  );
}
