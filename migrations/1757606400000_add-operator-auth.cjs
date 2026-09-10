/**
 * AKR-5 operator auth: password on operator, server-side sessions, and
 * invite tokens.
 *
 * `password_hash` gets a temporary `default: ""` so the ADD COLUMN succeeds
 * against a non-empty `operator` table on migrate-down/up cycles (e.g. CI's
 * reversibility check re-adds this column after a seeded row already
 * exists). An empty hash never verifies against any password, so it's a
 * safe placeholder, not a security hole.
 *
 * Only token *hashes* (sha256) are ever stored for sessions and invites —
 * the raw token lives only in the cookie / invite link.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn("operator", {
    password_hash: { type: "text", notNull: true, default: "" },
  });

  pgm.createTable("operator_session", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    operator_id: {
      type: "uuid",
      notNull: true,
      references: "operator(id)",
      onDelete: "CASCADE",
    },
    token_hash: { type: "text", notNull: true, unique: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    expires_at: { type: "timestamptz", notNull: true },
  });
  pgm.createIndex("operator_session", "operator_id");

  pgm.createTable("operator_invite", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    email: { type: "text", notNull: true },
    token_hash: { type: "text", notNull: true, unique: true },
    invited_by_operator_id: {
      type: "uuid",
      notNull: true,
      references: "operator(id)",
      onDelete: "CASCADE",
    },
    // Snapshot of the property grant at invite time. No FK array constraint
    // in Postgres; app layer validates every id against the inviter's own
    // operator_property rows before the invite is created.
    property_ids: { type: "uuid[]", notNull: true },
    role: { type: "operator_role", notNull: true, default: "manager" },
    accepted_at: { type: "timestamptz" },
    expires_at: { type: "timestamptz", notNull: true },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });
  pgm.createIndex("operator_invite", "email");
};

exports.down = (pgm) => {
  pgm.dropTable("operator_invite");
  pgm.dropTable("operator_session");
  pgm.dropColumn("operator", "password_hash");
};
