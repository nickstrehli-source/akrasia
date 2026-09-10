import { describe, expect, it } from "vitest";
import { redactPii } from "./redact";

describe("redactPii", () => {
  it("redacts known PII-shaped keys", () => {
    const input = {
      tenantEmail: "jane@example.com",
      tenant_name: "Jane Doe",
      phone: "555-0100",
      ssn: "123-45-6789",
      dob: "1990-01-01",
    };
    expect(redactPii(input)).toEqual({
      tenantEmail: "[redacted]",
      tenant_name: "[redacted]",
      phone: "[redacted]",
      ssn: "[redacted]",
      dob: "[redacted]",
    });
  });

  it("leaves non-PII keys, including ones that share the substring 'name', untouched", () => {
    const input = { toolName: "dummy.echo", propertyId: "p1", message: "hi" };
    expect(redactPii(input)).toEqual(input);
  });

  it("recurses into nested objects and arrays", () => {
    const input = { tenants: [{ email: "a@test.local" }, { email: "b@test.local" }] };
    expect(redactPii(input)).toEqual({
      tenants: [{ email: "[redacted]" }, { email: "[redacted]" }],
    });
  });

  it("passes through primitives and null unchanged", () => {
    expect(redactPii(42)).toBe(42);
    expect(redactPii(null)).toBe(null);
    expect(redactPii("plain string")).toBe("plain string");
  });
});
