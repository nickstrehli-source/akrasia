#!/usr/bin/env node
// Deterministic demo seed for AKR-4 (+ AKR-5 operator password).
// Populates: 1 landlord operator, 2 properties, 4 units, 2 tenants, 2 active
// leases, 1 open work order. Fixed UUIDs keep results reproducible across runs.

import pg from "pg";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const { Client } = pg;
const scrypt = promisify(scryptCallback);

// Mirrors src/lib/auth/password.ts. Duplicated (not imported) because this
// script runs as plain Node/ESM with no TS build step.
const DEMO_PASSWORD = "demo-password123";
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

const IDS = {
  operatorOwner: "11111111-1111-4111-8111-111111111111",
  propertyMaple: "22222222-2222-4222-8222-222222222221",
  propertyOak: "22222222-2222-4222-8222-222222222222",
  unitMaple1A: "33333333-3333-4333-8333-333333333331",
  unitMaple1B: "33333333-3333-4333-8333-333333333332",
  unitOak2A: "33333333-3333-4333-8333-333333333333",
  unitOak2B: "33333333-3333-4333-8333-333333333334",
  tenantAlex: "44444444-4444-4444-8444-444444444441",
  tenantBlair: "44444444-4444-4444-8444-444444444442",
  leaseMaple1A: "55555555-5555-4555-8555-555555555551",
  leaseOak2A: "55555555-5555-4555-8555-555555555552",
  workOrderMapleFaucet: "66666666-6666-4666-8666-666666666661",
};

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");

  // Order matters: children first (FKs pointing into these get cleared).
  const tables = [
    "payment",
    "work_order",
    "lease",
    "operator_property",
    "unit",
    "tenant",
    "property",
    "operator",
  ];
  for (const t of tables) {
    await client.query(`DELETE FROM ${t}`);
  }

  await client.query(
    `INSERT INTO operator (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
    [
      IDS.operatorOwner,
      "owner@demo.akrasia.local",
      "Demo Landlord",
      await hashPassword(DEMO_PASSWORD),
    ],
  );

  await client.query(
    `INSERT INTO property
       (id, owner_operator_id, name, address_line1, city, region, postal_code, country)
     VALUES
       ($1, $2, 'Maple Street Duplex', '123 Maple St', 'Austin', 'TX', '78701', 'US'),
       ($3, $2, 'Oak Avenue Duplex',   '456 Oak Ave',  'Austin', 'TX', '78702', 'US')`,
    [IDS.propertyMaple, IDS.operatorOwner, IDS.propertyOak],
  );

  await client.query(
    `INSERT INTO operator_property (operator_id, property_id, role) VALUES
       ($1, $2, 'owner'),
       ($1, $3, 'owner')`,
    [IDS.operatorOwner, IDS.propertyMaple, IDS.propertyOak],
  );

  await client.query(
    `INSERT INTO unit (id, property_id, label, bedrooms, bathrooms, square_feet) VALUES
       ($1, $5, '1A', 2, 1.0,  850),
       ($2, $5, '1B', 1, 1.0,  620),
       ($3, $6, '2A', 3, 2.0, 1100),
       ($4, $6, '2B', 2, 1.5,  900)`,
    [
      IDS.unitMaple1A,
      IDS.unitMaple1B,
      IDS.unitOak2A,
      IDS.unitOak2B,
      IDS.propertyMaple,
      IDS.propertyOak,
    ],
  );

  await client.query(
    `INSERT INTO tenant (id, full_name, email, phone) VALUES
       ($1, 'Alex Tenant',  'alex@demo.tenant.local',  '555-0101'),
       ($2, 'Blair Tenant', 'blair@demo.tenant.local', '555-0102')`,
    [IDS.tenantAlex, IDS.tenantBlair],
  );

  await client.query(
    `INSERT INTO lease
       (id, unit_id, tenant_id, start_date, end_date, monthly_rent_cents, deposit_cents, status)
     VALUES
       ($1, $3, $5, DATE '2026-01-01', DATE '2026-12-31', 150000, 150000, 'active'),
       ($2, $4, $6, DATE '2026-02-01', DATE '2027-01-31', 220000, 220000, 'active')`,
    [
      IDS.leaseMaple1A,
      IDS.leaseOak2A,
      IDS.unitMaple1A,
      IDS.unitOak2A,
      IDS.tenantAlex,
      IDS.tenantBlair,
    ],
  );

  await client.query(
    `INSERT INTO work_order
       (id, property_id, unit_id, reported_by_tenant_id, assigned_operator_id,
        title, description, status, priority)
     VALUES
       ($1, $2, $3, $4, $5,
        'Leaky kitchen faucet',
        'Steady drip from the cold-water valve; noticed over the weekend.',
        'open', 'normal')`,
    [
      IDS.workOrderMapleFaucet,
      IDS.propertyMaple,
      IDS.unitMaple1A,
      IDS.tenantAlex,
      IDS.operatorOwner,
    ],
  );

  await client.query("COMMIT");
  console.log(
    "Seeded demo dataset: 1 operator, 2 properties, 4 units, 2 tenants, 2 active leases, 1 open work order.",
  );
  console.log(`Demo login: owner@demo.akrasia.local / ${DEMO_PASSWORD}`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
