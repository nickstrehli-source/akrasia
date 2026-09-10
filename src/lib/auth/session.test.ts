import { describe, it, expect, vi, afterEach } from "vitest";
import { sessionCookieOptions } from "./session";

describe("sessionCookieOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is always httpOnly", () => {
    expect(sessionCookieOptions(new Date()).httpOnly).toBe(true);
  });

  it("is secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions(new Date()).secure).toBe(true);
  });

  it("is not secure in development, so local http works", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions(new Date()).secure).toBe(false);
  });
});
