import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { acceptInvite } from "@/lib/auth/invite";
import { getPool } from "@/db/client";
import { resetDb, closeDb } from "@/test/db";
import { createOperator, createProperty, grantAccess } from "@/test/fixtures";

function inviteRequest(body: URLSearchParams, cookie?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (cookie) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest("http://localhost/api/operators/invite", {
    method: "POST",
    body,
    headers,
  });
}

describe.skipIf(!process.env.DATABASE_URL)("POST /api/operators/invite", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("rejects an unauthenticated caller", async () => {
    const res = await POST(inviteRequest(new URLSearchParams({ email: "x@test.local" })));
    expect(res.status).toBe(401);
  });

  it("rejects inviting to a property the caller doesn't have access to", async () => {
    const owner = await createOperator({ email: "owner@test.local" });
    const { token } = await createSession(owner);

    const otherOwner = await createOperator({ email: "other@test.local" });
    const otherProperty = await createProperty(otherOwner);
    await grantAccess(otherOwner, otherProperty);

    const body = new URLSearchParams({ email: "invitee@test.local" });
    body.append("propertyIds", otherProperty);

    const res = await POST(inviteRequest(body, token));
    expect(res.status).toBe(403);
  });

  it("lets an existing operator invite someone, who then only gets the granted properties", async () => {
    const owner = await createOperator({ email: "owner2@test.local" });
    const granted = await createProperty(owner, "Granted");
    const notGranted = await createProperty(owner, "Not granted");
    await grantAccess(owner, granted);
    await grantAccess(owner, notGranted);
    const { token } = await createSession(owner);

    const body = new URLSearchParams({ email: "newop@test.local" });
    body.append("propertyIds", granted);

    const res = await POST(inviteRequest(body, token));
    expect(res.status).toBe(200);
    const html = await res.text();
    const match = html.match(/token=([\w-]+)/);
    expect(match).not.toBeNull();

    const inviteToken = match![1];
    const { operatorId } = await acceptInvite({
      token: inviteToken,
      name: "New Op",
      password: "long-enough-pw",
    });

    const { rows } = await getPool().query(
      `SELECT property_id FROM operator_property WHERE operator_id = $1`,
      [operatorId],
    );
    expect(rows.map((r) => r.property_id)).toEqual([granted]);
  });
});
