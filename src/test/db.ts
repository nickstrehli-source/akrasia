import { getPool } from "@/db/client";

const TABLES = [
  "operator_invite",
  "operator_session",
  "payment",
  "work_order",
  "lease",
  "operator_property",
  "unit",
  "tenant",
  "property",
  "operator",
];

/** Wipes every app table. Only ever call this against a disposable test DB. */
export async function resetDb(): Promise<void> {
  await getPool().query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function closeDb(): Promise<void> {
  await getPool().end();
}
