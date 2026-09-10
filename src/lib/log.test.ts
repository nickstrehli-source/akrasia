import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { errorMessage, withRouteErrorLogging } from "./log";

describe("errorMessage", () => {
  it("unwraps an Error's message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error throws", () => {
    expect(errorMessage("plain string")).toBe("plain string");
  });
});

describe("withRouteErrorLogging", () => {
  it("passes through a handler's own response untouched", async () => {
    const handler = vi.fn(async () => NextResponse.json({ ok: true }, { status: 200 }));
    const wrapped = withRouteErrorLogging("test-route", handler);

    const res = await wrapped();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("catches an escaping error and returns a generic 500 instead of throwing", async () => {
    const handler = vi.fn(async () => {
      throw new Error("unexpected failure");
    });
    const wrapped = withRouteErrorLogging("test-route", handler);

    const res = await wrapped();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});
