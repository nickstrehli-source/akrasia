import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { requirePropertyAccess, operatorProperties, ForbiddenError } from "./access";
import { resetDb, closeDb } from "@/test/db";
import { createOperator, createProperty, grantAccess } from "@/test/fixtures";

// Matches the repo convention set in src/agents/runtime.pg.test.ts: skip
// Postgres-backed tests when there's no DATABASE_URL (the `quality` CI job
// now provisions one; a bare local `npm test` without Postgres still passes).
describe.skipIf(!process.env.DATABASE_URL)("requirePropertyAccess", () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it("rejects an operator who was never granted access to the property", async () => {
    const owner = await createOperator({ email: "owner@test.local" });
    const outsider = await createOperator({ email: "outsider@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);

    await expect(requirePropertyAccess(outsider, property)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an operator with a granted operator_property row", async () => {
    const owner = await createOperator({ email: "owner2@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);

    await expect(requirePropertyAccess(owner, property)).resolves.toBeUndefined();
  });

  it("does not leak another operator's properties into operatorProperties", async () => {
    const owner = await createOperator({ email: "owner3@test.local" });
    const outsider = await createOperator({ email: "outsider3@test.local" });
    const property = await createProperty(owner);
    await grantAccess(owner, property);

    expect(await operatorProperties(outsider)).toEqual([]);
    expect(await operatorProperties(owner)).toEqual([{ id: property, name: expect.any(String) }]);
  });
});
