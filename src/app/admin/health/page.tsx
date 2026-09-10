import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getHealthStats, listRecentLogEntries } from "@/lib/observability";

function ms(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}ms`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default async function AdminHealthPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionOperator(token);
  if (!session) {
    redirect("/login");
  }

  const [stats, entries] = await Promise.all([getHealthStats(), listRecentLogEntries(50)]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem" }}>
      <p>
        <Link href="/dashboard">&larr; Dashboard</Link>
      </p>
      <h1 style={{ fontSize: "1.5rem" }}>Staging health</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "1rem",
          margin: "1.5rem 0",
        }}
      >
        <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#555" }}>Agent runs</div>
          <div style={{ fontSize: "1.5rem" }}>{stats.runCount}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#555" }}>Failure rate</div>
          <div style={{ fontSize: "1.5rem" }}>{pct(stats.failureRate)}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#555" }}>Mean duration</div>
          <div style={{ fontSize: "1.5rem" }}>{ms(stats.meanDurationMs)}</div>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 4, padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#555" }}>p95 duration</div>
          <div style={{ fontSize: "1.5rem" }}>{ms(stats.p95DurationMs)}</div>
        </div>
      </div>

      <h2>Recent errors</h2>
      {entries.length === 0 ? (
        <p>No errors logged.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th>When</th>
              <th>Source</th>
              <th>Level</th>
              <th>Message</th>
              <th>Property</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={`${entry.source}:${entry.id}`} style={{ borderBottom: "1px solid #eee" }}>
                <td>{entry.createdAt.toISOString()}</td>
                <td>{entry.source}</td>
                <td>{entry.level}</td>
                <td>{entry.message}</td>
                <td>{entry.propertyId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
