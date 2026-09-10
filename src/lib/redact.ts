/**
 * Heuristic PII redactor for agent trace input/output (AKR-10). Tool
 * payloads are arbitrary JSON defined per-tool, so there's no fixed schema
 * to redact against — this matches on key names that strongly signal tenant
 * PII rather than trying to enumerate every tool's shape. Deliberately
 * narrow (email/phone/ssn/dob/tenant-prefixed) to avoid redacting
 * non-sensitive identifiers like `toolName` or `propertyId` that share the
 * word "name"/"id".
 */
const PII_KEY_PATTERN =
  /email|phone|ssn|social_security|socialsecurity|date_?of_?birth|\bdob\b|tenant_?name/i;

const REDACTED = "[redacted]";

export function redactPii<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        PII_KEY_PATTERN.test(key) ? REDACTED : redactValue(v),
      ]),
    );
  }
  return value;
}
