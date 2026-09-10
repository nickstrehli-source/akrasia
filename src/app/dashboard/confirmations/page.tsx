import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { operatorProperties } from "@/lib/auth/access";
import { listConfirmationLog } from "@/agents";

export default async function ConfirmationLogPage({
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

  const entries = propertyId ? await listConfirmationLog({ propertyId }) : [];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <p>
        <Link href="/dashboard">&larr; Dashboard</Link>
      </p>
      <h1 style={{ fontSize: "1.5rem" }}>Confirmation-gate log</h1>
      <p style={{ color: "#555" }}>
        Every irreversible tool call for this property — pending, approved, or rejected — with who
        reviewed it and when.
      </p>

      {properties.length === 0 ? (
        <p>No properties yet.</p>
      ) : (
        <>
          <nav style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {properties.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/confirmations?propertyId=${p.id}`}
                style={{ fontWeight: p.id === propertyId ? "bold" : "normal" }}
              >
                {p.name}
              </Link>
            ))}
          </nav>

          {entries.length === 0 ? (
            <p>No irreversible tool calls for this property yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th>Tool</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Reviewed by</th>
                  <th>Reviewed at</th>
                  <th>Run</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((call) => (
                  <tr key={call.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{call.toolName}</td>
                    <td>{call.status}</td>
                    <td>{call.requestedAt.toISOString()}</td>
                    <td>{call.reviewedByOperatorId ?? "—"}</td>
                    <td>{call.reviewedAt ? call.reviewedAt.toISOString() : "—"}</td>
                    <td>
                      <Link href={`/dashboard/runs/${call.agentRunId}`}>trace</Link>
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
