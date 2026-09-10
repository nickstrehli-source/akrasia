export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section style={{ textAlign: "center", maxWidth: 640 }}>
        <h1 style={{ fontSize: "3rem", margin: 0, letterSpacing: "-0.02em" }}>hello Akrasia</h1>
        <p style={{ color: "var(--muted)", marginTop: "0.75rem" }}>
          Real Estate Management, run by agents. Staging skeleton — no features yet.
        </p>
        <p style={{ marginTop: "1.5rem" }}>
          <a href="/login">Operator log in</a>
        </p>
      </section>
    </main>
  );
}
