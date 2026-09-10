import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getPool } from "@/db/client";
import { createInvite, acceptInvite, InviteError } from "./invite";
import { ForbiddenError } from "./access";
import { resetDb, closeDb } from "@/test/db";
import { createOperator, createProperty, grantAccess } from "@/test/fixtures";

describe.skipIf(!process.env.DATABASE_URL)("createInvite", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("refuses to invite someone to a property the inviter can't access", async () => {
    const owner = await createOperator({ email: "owner@test.local" });
    const otherOwner = await createOperator({ email: "other@test.local" });
    const otherProperty = await createProperty(otherOwner);
    await grantAccess(otherOwner, otherProperty);

    await expect(
      createInvite({
        invitedByOperatorId: owner,
        email: "invitee@test.local",
        propertyIds: [otherProperty],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("issues a token when the inviter has access to every requested property", async () => {
    const owner = await createOperator({ email: "owner2@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);

    const { token, expiresAt } = await createInvite({
      invitedByOperatorId: owner,
      email: "invitee2@test.local",
      propertyIds: [property],
    });

    expect(token.length).toBeGreaterThan(0);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe.skipIf(!process.env.DATABASE_URL)("acceptInvite", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("grants exactly the invited properties, not the inviter's other properties", async () => {
    const owner = await createOperator({ email: "owner3@test.local" });
    const granted = await createProperty(owner, "Granted");
    const notGranted = await createProperty(owner, "Not granted");
    await grantAccess(owner, granted);
    await grantAccess(owner, notGranted);

    const { token } = await createInvite({
      invitedByOperatorId: owner,
      email: "newop@test.local",
      propertyIds: [granted],
    });

    const { operatorId } = await acceptInvite({
      token,
      name: "New Op",
      password: "long-enough-pw",
    });

    const { rows } = await getPool().query(
      `SELECT property_id FROM operator_property WHERE operator_id = $1`,
      [operatorId],
    );
    expect(rows.map((r) => r.property_id)).toEqual([granted]);
  });

  it("rejects an expired invite", async () => {
    const owner = await createOperator({ email: "owner4@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);
    const { token } = await createInvite({
      invitedByOperatorId: owner,
      email: "late@test.local",
      propertyIds: [property],
    });

    // Force the invite into the past.
    await getPool().query(`UPDATE operator_invite SET expires_at = now() - interval '1 minute'`);

    await expect(
      acceptInvite({ token, name: "Late", password: "long-enough-pw" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("is single-use: a second accept of the same token fails", async () => {
    const owner = await createOperator({ email: "owner5@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);
    const { token } = await createInvite({
      invitedByOperatorId: owner,
      email: "once@test.local",
      propertyIds: [property],
    });

    await acceptInvite({ token, name: "Once", password: "long-enough-pw" });

    await expect(
      acceptInvite({ token, name: "Once Again", password: "long-enough-pw" }),
    ).rejects.toBeInstanceOf(InviteError);
  });

  it("rejects an unknown token", async () => {
    await expect(
      acceptInvite({ token: "not-a-real-token", name: "Nobody", password: "long-enough-pw" }),
    ).rejects.toBeInstanceOf(InviteError);
  });
});
