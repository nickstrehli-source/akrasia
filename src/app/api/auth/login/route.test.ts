import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { resetDb, closeDb } from "@/test/db";
import { createOperator } from "@/test/fixtures";

function loginRequest(email: string, password: string) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    // Stringify rather than passing the URLSearchParams instance directly —
    // undici's Request constructor does an `instanceof` check against its
    // own realm's URLSearchParams, which fails under Vitest's jsdom
    // environment (a different global than Node's).
    body: new URLSearchParams({ email, password }).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

describe.skipIf(!process.env.DATABASE_URL)("POST /api/auth/login", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("rejects an unknown email", async () => {
    const res = await POST(loginRequest("nobody@test.local", "whatever12"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login?error=");
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    await createOperator({ email: "op@test.local", password: "correct-password" });
    const res = await POST(loginRequest("op@test.local", "wrong-password"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login?error=");
  });

  it("logs in with correct credentials and sets an httpOnly session cookie", async () => {
    await createOperator({ email: "op2@test.local", password: "correct-password" });
    const res = await POST(loginRequest("op2@test.local", "correct-password"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/dashboard");

    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
  });
});
