import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createSession, getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { resetDb, closeDb } from "@/test/db";
import { createOperator } from "@/test/fixtures";

describe.skipIf(!process.env.DATABASE_URL)("POST /api/auth/logout", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("destroys the session so the token no longer authenticates", async () => {
    const operator = await createOperator({ email: "op@test.local" });
    const { token } = await createSession(operator);
    expect(await getSessionOperator(token)).not.toBeNull();

    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login");

    expect(await getSessionOperator(token)).toBeNull();
  });
});
