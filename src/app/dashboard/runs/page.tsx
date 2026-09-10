import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { operatorProperties } from "@/lib/auth/access";
import { listAgentRuns } from "@/agents";

function elapsedLabel(startedAt: Date, endedAt: Date | null): string {
  if (!endedAt) return "running";
  return `${endedAt.getTime() - startedAt.getTime()}ms`;
}

export default async function AgentRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionOperator(token);
  if (!session) {
    redirect("/login");
  }

  const properties = await operatorProperties(session.operatorId);
  const { propertyId: requestedPropertyId } = await searchParams;
  const propertyId =
    requestedPropertyId && properties.some((p) => p.id === requestedPropertyId)
      ? requestedPropertyId
      : properties[0]?.id;

  const runs = propertyId ? await listAgentRuns({ propertyId }) : [];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <p>
        <Link href="/dashboard">&larr; Dashboard</Link>
      </p>
      <h1 style={{ fontSize: "1.5rem" }}>Agent runs</h1>

      {properties.length === 0 ? (
        <p>No properties yet.</p>
      ) : (
        <>
          <nav style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {properties.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/runs?propertyId=${p.id}`}
                style={{ fontWeight: p.id === propertyId ? "bold" : "normal" }}
              >
                {p.name}
              </Link>
            ))}
          </nav>

          {runs.length === 0 ? (
            <p>No agent runs yet for this property.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Elapsed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{run.agentName}</td>
                    <td>{run.status}</td>
                    <td>{run.startedAt.toISOString()}</td>
                    <td>{elapsedLabel(run.startedAt, run.endedAt)}</td>
                    <td>
                      <Link href={`/dashboard/runs/${run.id}`}>View trace</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
