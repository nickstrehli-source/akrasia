/**
 * AKR-10 observability: `system_log` catches server errors that aren't
 * already captured by the agent substrate (`agent_run`/`agent_tool_call`
 * already carry agent-loop and tool-call failures — see
 * src/lib/observability.ts, which UNIONs all three into one searchable
 * surface instead of duplicating agent failures into this table).
 *
 * Delete semantics: append-only, no deletes (matches agent_run/agent_tool_call).
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("system_log", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    level: { type: "text", notNull: true },
    source: { type: "text", notNull: true },
    message: { type: "text", notNull: true },
    context: { type: "jsonb", notNull: true, default: "{}" },
    property_id: {
      type: "uuid",
      references: "property(id)",
      onDelete: "SET NULL",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("system_log", "system_log_level_check", {
    check: "level IN ('error', 'warn', 'info')",
  });

  pgm.createIndex("system_log", "created_at");
  pgm.createIndex("system_log", "level");
  pgm.createIndex("system_log", "property_id");
};

exports.down = (pgm) => {
  pgm.dropTable("system_log");
};
