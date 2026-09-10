import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("salts hashes so the same password hashes differently each time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("rejects against a malformed stored hash instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });

  it("never matches an empty placeholder hash", async () => {
    expect(await verifyPassword("", "")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});
