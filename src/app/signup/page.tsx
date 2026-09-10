export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token = "", error } = await searchParams;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <form
        method="POST"
        action="/api/auth/signup"
        style={{ width: 320, display: "grid", gap: "0.75rem" }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Accept invite</h1>
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        <input type="hidden" name="token" value={token} />
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Name
          <input type="text" name="name" required autoFocus />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Password
          <input type="password" name="password" required minLength={8} />
        </label>
        <button type="submit">Create account</button>
      </form>
    </main>
  );
}
