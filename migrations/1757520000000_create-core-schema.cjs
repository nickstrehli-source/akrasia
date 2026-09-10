/**
 * AKR-4 core data model: operator, property, unit, tenant, lease,
 * operator_property, work_order, payment.
 *
 * Soft-delete convention:
 *   - Every mutable business entity has `deleted_at timestamptz` (NULL = live).
 *   - `payment` is an immutable ledger and has NO `deleted_at`; correct with a
 *     compensating entry.
 *   - Join tables (`operator_property`) rely on hard delete + CASCADE.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.createType("operator_role", ["owner", "manager"]);
  pgm.createType("lease_status", ["pending", "active", "ended"]);
  pgm.createType("work_order_status", ["open", "in_progress", "closed", "cancelled"]);
  pgm.createType("work_order_priority", ["low", "normal", "high", "urgent"]);
  pgm.createType("payment_direction", ["inbound", "outbound"]);
  pgm.createType("payment_kind", ["rent", "deposit", "refund", "fee", "adjustment"]);

  const timestamps = {
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
    deleted_at: { type: "timestamptz" },
  };

  pgm.createTable("operator", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    email: { type: "text", notNull: true, unique: true },
    name: { type: "text", notNull: true },
    ...timestamps,
  });

  pgm.createTable("property", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    owner_operator_id: {
      type: "uuid",
      notNull: true,
      references: "operator(id)",
      onDelete: "RESTRICT",
    },
    name: { type: "text", notNull: true },
    address_line1: { type: "text", notNull: true },
    address_line2: { type: "text" },
    city: { type: "text", notNull: true },
    region: { type: "text", notNull: true },
    postal_code: { type: "text", notNull: true },
    country: { type: "text", notNull: true },
    ...timestamps,
  });

  pgm.createTable(
    "operator_property",
    {
      operator_id: {
        type: "uuid",
        notNull: true,
        references: "operator(id)",
        onDelete: "CASCADE",
      },
      property_id: {
        type: "uuid",
        notNull: true,
        references: "property(id)",
        onDelete: "CASCADE",
      },
      role: { type: "operator_role", notNull: true },
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
    },
    {
      constraints: {
        primaryKey: ["operator_id", "property_id"],
      },
    },
  );

  pgm.createTable("unit", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    property_id: {
      type: "uuid",
      notNull: true,
      references: "property(id)",
      onDelete: "RESTRICT",
    },
    label: { type: "text", notNull: true },
    bedrooms: { type: "integer", notNull: true, default: 0 },
    bathrooms: { type: "numeric(3,1)", notNull: true, default: 0 },
    square_feet: { type: "integer" },
    ...timestamps,
  });
  pgm.addConstraint("unit", "unit_property_label_unique", {
    unique: ["property_id", "label"],
  });

  pgm.createTable("tenant", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    full_name: { type: "text", notNull: true },
    email: { type: "text", notNull: true, unique: true },
    phone: { type: "text" },
    ...timestamps,
  });

  pgm.createTable("lease", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    unit_id: {
      type: "uuid",
      notNull: true,
      references: "unit(id)",
      onDelete: "RESTRICT",
    },
    tenant_id: {
      type: "uuid",
      notNull: true,
      references: "tenant(id)",
      onDelete: "RESTRICT",
    },
    start_date: { type: "date", notNull: true },
    end_date: { type: "date" },
    monthly_rent_cents: { type: "bigint", notNull: true },
    deposit_cents: { type: "bigint", notNull: true, default: 0 },
    status: { type: "lease_status", notNull: true, default: "pending" },
    ...timestamps,
  });
  pgm.createIndex("lease", ["unit_id"], {
    name: "lease_active_unit_unique",
    unique: true,
    where: "status = 'active' AND deleted_at IS NULL",
  });

  pgm.createTable("work_order", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    property_id: {
      type: "uuid",
      notNull: true,
      references: "property(id)",
      onDelete: "RESTRICT",
    },
    unit_id: {
      type: "uuid",
      references: "unit(id)",
      onDelete: "RESTRICT",
    },
    reported_by_tenant_id: {
      type: "uuid",
      references: "tenant(id)",
      onDelete: "SET NULL",
    },
    assigned_operator_id: {
      type: "uuid",
      references: "operator(id)",
      onDelete: "SET NULL",
    },
    title: { type: "text", notNull: true },
    description: { type: "text", notNull: true, default: "" },
    status: { type: "work_order_status", notNull: true, default: "open" },
    priority: {
      type: "work_order_priority",
      notNull: true,
      default: "normal",
    },
    opened_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    closed_at: { type: "timestamptz" },
    ...timestamps,
  });

  pgm.createTable("payment", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },
    lease_id: {
      type: "uuid",
      notNull: true,
      references: "lease(id)",
      onDelete: "RESTRICT",
    },
    direction: { type: "payment_direction", notNull: true },
    kind: { type: "payment_kind", notNull: true },
    amount_cents: { type: "bigint", notNull: true },
    currency: { type: "char(3)", notNull: true, default: "USD" },
    posted_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
    memo: { type: "text" },
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
  pgm.addConstraint("payment", "payment_amount_positive", {
    check: "amount_cents > 0",
  });

  pgm.createIndex("property", "owner_operator_id");
  pgm.createIndex("unit", "property_id");
  pgm.createIndex("lease", "unit_id");
  pgm.createIndex("lease", "tenant_id");
  pgm.createIndex("work_order", "property_id");
  pgm.createIndex("work_order", "unit_id");
  pgm.createIndex("payment", "lease_id");
  pgm.createIndex("operator_property", "property_id");
};

exports.down = (pgm) => {
  pgm.dropTable("payment");
  pgm.dropTable("work_order");
  pgm.dropTable("lease");
  pgm.dropTable("tenant");
  pgm.dropTable("unit");
  pgm.dropTable("operator_property");
  pgm.dropTable("property");
  pgm.dropTable("operator");
  pgm.dropType("payment_kind");
  pgm.dropType("payment_direction");
  pgm.dropType("work_order_priority");
  pgm.dropType("work_order_status");
  pgm.dropType("lease_status");
  pgm.dropType("operator_role");
};
