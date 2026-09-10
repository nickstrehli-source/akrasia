import { randomBytes, createHash } from "node:crypto";

/** Raw, high-entropy token handed to the client (cookie / invite link). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is ever persisted — the raw token is never stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
