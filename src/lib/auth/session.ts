import { getPool } from "@/db/client";
import { hashToken, generateToken } from "./tokens";
import { verifyPassword } from "./password";

export const SESSION_COOKIE_NAME = "akrasia_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export class InvalidCredentialsError extends Error {}

export interface SessionOperator {
  operatorId: string;
  email: string;
  name: string;
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** Verifies email/password and returns the operator id, or throws. */
export async function login(email: string, password: string): Promise<string> {
  const { rows } = await getPool().query(
    `SELECT id, password_hash FROM operator WHERE email = $1 AND deleted_at IS NULL`,
    [email.trim().toLowerCase()],
  );
  if (rows.length === 0) {
    throw new InvalidCredentialsError("Invalid email or password");
  }
  const ok = await verifyPassword(password, rows[0].password_hash);
  if (!ok) {
    throw new InvalidCredentialsError("Invalid email or password");
  }
  return rows[0].id as string;
}

export async function createSession(
  operatorId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getPool().query(
    `INSERT INTO operator_session (operator_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [operatorId, hashToken(token), expiresAt],
  );
  return { token, expiresAt };
}

export async function getSessionOperator(
  token: string | undefined | null,
): Promise<SessionOperator | null> {
  if (!token) return null;
  const { rows } = await getPool().query(
    `SELECT o.id, o.email, o.name
       FROM operator_session s
       JOIN operator o ON o.id = s.operator_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND o.deleted_at IS NULL`,
    [hashToken(token)],
  );
  if (rows.length === 0) return null;
  return { operatorId: rows[0].id, email: rows[0].email, name: rows[0].name };
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await getPool().query(`DELETE FROM operator_session WHERE token_hash = $1`, [hashToken(token)]);
}
