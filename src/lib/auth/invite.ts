import { getPool } from "@/db/client";
import { generateToken, hashToken } from "./tokens";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";
import { requirePropertyAccess } from "./access";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export class InviteError extends Error {}

export async function createInvite(params: {
  invitedByOperatorId: string;
  email: string;
  propertyIds: string[];
  role?: "owner" | "manager";
}): Promise<{ token: string; expiresAt: Date }> {
  const { invitedByOperatorId, propertyIds, role = "manager" } = params;
  const email = params.email.trim().toLowerCase();
  if (!email || propertyIds.length === 0) {
    throw new InviteError("Email and at least one property are required");
  }

  // Inviter must have access to every property they're about to grant —
  // this is what stops an invite from escalating access beyond the
  // inviter's own scope.
  for (const propertyId of propertyIds) {
    await requirePropertyAccess(invitedByOperatorId, propertyId);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await getPool().query(
    `INSERT INTO operator_invite
       (email, token_hash, invited_by_operator_id, property_ids, role, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [email, hashToken(token), invitedByOperatorId, propertyIds, role, expiresAt],
  );

  return { token, expiresAt };
}

export async function acceptInvite(params: {
  token: string;
  name: string;
  password: string;
}): Promise<{ operatorId: string }> {
  const { token, name, password } = params;
  if (!name.trim() || password.length < MIN_PASSWORD_LENGTH) {
    throw new InviteError(
      `Name is required and password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE + the accepted_at/expires_at predicate makes accept
    // atomic: two concurrent requests for the same token can't both pass.
    const { rows } = await client.query(
      `SELECT id, email, property_ids, role
         FROM operator_invite
        WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashToken(token)],
    );
    if (rows.length === 0) {
      throw new InviteError("Invite is invalid, expired, or already used");
    }
    const invite = rows[0] as {
      id: string;
      email: string;
      property_ids: string[];
      role: "owner" | "manager";
    };

    const existing = await client.query(`SELECT id FROM operator WHERE email = $1`, [invite.email]);
    if (existing.rows.length > 0) {
      throw new InviteError("An operator with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const created = await client.query(
      `INSERT INTO operator (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [invite.email, name.trim(), passwordHash],
    );
    const operatorId = created.rows[0].id as string;

    for (const propertyId of invite.property_ids) {
      await client.query(
        `INSERT INTO operator_property (operator_id, property_id, role) VALUES ($1, $2, $3)`,
        [operatorId, propertyId, invite.role],
      );
    }

    await client.query(`UPDATE operator_invite SET accepted_at = now() WHERE id = $1`, [invite.id]);

    await client.query("COMMIT");
    return { operatorId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
