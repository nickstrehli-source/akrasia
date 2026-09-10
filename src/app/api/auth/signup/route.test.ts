import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createInvite } from "@/lib/auth/invite";
import { resetDb, closeDb } from "@/test/db";
import { createOperator, createProperty, grantAccess } from "@/test/fixtures";

function signupRequest(token: string, name: string, password: string) {
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    body: new URLSearchParams({ token, name, password }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

describe.skipIf(!process.env.DATABASE_URL)("POST /api/auth/signup", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("accepts a valid invite, creates the operator, and sets a session cookie", async () => {
    const owner = await createOperator({ email: "owner@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);
    const { token } = await createInvite({
      invitedByOperatorId: owner,
      email: "newop@test.local",
      propertyIds: [property],
    });

    const res = await POST(signupRequest(token, "New Operator", "long-enough-pw"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/dashboard");
    expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeDefined();
  });

  it("rejects an invite token that was already used", async () => {
    const owner = await createOperator({ email: "owner2@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);
    const { token } = await createInvite({
      invitedByOperatorId: owner,
      email: "reuse@test.local",
      propertyIds: [property],
    });

    await POST(signupRequest(token, "First", "long-enough-pw"));
    const second = await POST(signupRequest(token, "Second", "long-enough-pw"));

    expect(second.status).toBe(303);
    expect(second.headers.get("location")).toContain("/signup");
    expect(second.headers.get("location")).toContain("error=");
    expect(second.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("rejects a bogus token", async () => {
    const res = await POST(signupRequest("bogus-token", "Nobody", "long-enough-pw"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/signup");
  });
});
