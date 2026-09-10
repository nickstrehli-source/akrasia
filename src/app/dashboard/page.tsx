import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { operatorProperties } from "@/lib/auth/access";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionOperator(token);
  if (!session) {
    redirect("/login");
  }

  const properties = await operatorProperties(session.operatorId);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Welcome, {session.name}</h1>
        <form method="POST" action="/api/auth/logout">
          <button type="submit">Log out</button>
        </form>
      </div>

      <h2>Your properties</h2>
      {properties.length === 0 ? (
        <p>No properties yet.</p>
      ) : (
        <ul>
          {properties.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}

      <h2>Observability</h2>
      <ul>
        <li>
          <Link href="/dashboard/runs">Agent runs</Link>
        </li>
        <li>
          <Link href="/dashboard/confirmations">Confirmation-gate log</Link>
        </li>
        <li>
          <Link href="/admin/health">Staging health</Link>
        </li>
      </ul>

      <h2>Invite an operator</h2>
      <form
        method="POST"
        action="/api/operators/invite"
        style={{ display: "grid", gap: "0.5rem", maxWidth: 320 }}
      >
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Email
          <input type="email" name="email" required />
        </label>
        <fieldset>
          <legend>Properties to grant</legend>
          {properties.map((p) => (
            <label key={p.id} style={{ display: "block" }}>
              <input type="checkbox" name="propertyIds" value={p.id} /> {p.name}
            </label>
          ))}
        </fieldset>
        <button type="submit">Send invite</button>
      </form>
    </main>
  );
}
