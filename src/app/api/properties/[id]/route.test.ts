import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { resetDb, closeDb } from "@/test/db";
import { createOperator, createProperty, grantAccess } from "@/test/fixtures";

function requestFor(propertyId: string, cookie?: string) {
  return new NextRequest(`http://localhost/api/properties/${propertyId}`, {
    headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : undefined,
  });
}

describe.skipIf(!process.env.DATABASE_URL)("GET /api/properties/[id]", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("rejects a request with no session", async () => {
    const owner = await createOperator({ email: "owner@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);

    const res = await GET(requestFor(property), { params: Promise.resolve({ id: property }) });
    expect(res.status).toBe(401);
  });

  it("rejects an authenticated operator who was never invited to this property", async () => {
    const owner = await createOperator({ email: "owner2@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);

    const outsider = await createOperator({ email: "outsider@test.local" });
    const { token } = await createSession(outsider);

    const res = await GET(requestFor(property, token), {
      params: Promise.resolve({ id: property }),
    });
    expect(res.status).toBe(404);
  });

  it("allows an operator who has been granted access", async () => {
    const owner = await createOperator({ email: "owner3@test.local" });
    const property = await createProperty(owner, "Maple Duplex");
    await grantAccess(owner, property);
    const { token } = await createSession(owner);

    const res = await GET(requestFor(property, token), {
      params: Promise.resolve({ id: property }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Maple Duplex");
  });
});
