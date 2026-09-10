/**
 * AKR-8 agent orchestration substrate: agent_run (trace) + agent_tool_call
 * (tool call log + HITL confirmation gate).
 *
 * Delete semantics: append-only trace/audit logs, no deletes supported.
 * `agent_tool_call` rows transition status in place (pending_approval ->
 * completed | failed | rejected); nothing is ever removed.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createType("agent_run_status", [
    "running",
    "awaiting_approval",
    "completed",
    "failed",
    "rejected",
  ]);
  pgm.createType("agent_tool_call_status", ["pending_approval", "completed", "failed", "rejected"]);

  pgm.createTable("agent_run", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    agent_name: { type: "text", notNull: true },
    operator_id: {
      type: "uuid",
      notNull: true,
      references: "operator(id)",
      onDelete: "RESTRICT",
    },
    property_id: {
      type: "uuid",
      notNull: true,
      references: "property(id)",
      onDelete: "RESTRICT",
    },
    status: { type: "agent_run_status", notNull: true, default: "running" },
    input: { type: "jsonb", notNull: true, default: "{}" },
    error: { type: "text" },
    started_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    ended_at: { type: "timestamptz" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createTable("agent_tool_call", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    agent_run_id: {
      type: "uuid",
      notNull: true,
      references: "agent_run(id)",
      onDelete: "CASCADE",
    },
    tool_name: { type: "text", notNull: true },
    irreversible: { type: "boolean", notNull: true },
    status: {
      type: "agent_tool_call_status",
      notNull: true,
      default: "pending_approval",
    },
    input: { type: "jsonb", notNull: true, default: "{}" },
    output: { type: "jsonb" },
    error: { type: "text" },
    requested_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    executed_at: { type: "timestamptz" },
    reviewed_by_operator_id: {
      type: "uuid",
      references: "operator(id)",
      onDelete: "SET NULL",
    },
    reviewed_at: { type: "timestamptz" },
    review_note: { type: "text" },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.addConstraint("agent_tool_call", "agent_tool_call_reversible_not_pending", {
    check: "NOT (irreversible = false AND status = 'pending_approval')",
  });

  pgm.createIndex("agent_run", "operator_id");
  pgm.createIndex("agent_run", "property_id");
  pgm.createIndex("agent_run", "status");
  pgm.createIndex("agent_tool_call", "agent_run_id");
  pgm.createIndex("agent_tool_call", "status");
};

exports.down = (pgm) => {
  pgm.dropTable("agent_tool_call");
  pgm.dropTable("agent_run");
  pgm.dropType("agent_tool_call_status");
  pgm.dropType("agent_run_status");
};
