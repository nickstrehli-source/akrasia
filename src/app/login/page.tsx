export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <form
        method="POST"
        action="/api/auth/login"
        style={{ width: 320, display: "grid", gap: "0.75rem" }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Log in</h1>
        {error && <p style={{ color: "crimson", margin: 0 }}>Invalid email or password.</p>}
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Email
          <input type="email" name="email" required autoFocus />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Password
          <input type="password" name="password" required minLength={8} />
        </label>
        <button type="submit">Log in</button>
      </form>
    </main>
  );
}
