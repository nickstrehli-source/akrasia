import { getPool } from "@/db/client";

/** Operator has no session, or no session was supplied. */
export class UnauthorizedError extends Error {}

/** Operator is authenticated but not scoped to the property in question. */
export class ForbiddenError extends Error {}

/**
 * Role-check middleware: throws ForbiddenError unless `operatorId` has an
 * operator_property row for `propertyId`. Every property-scoped route/action
 * must call this before reading or writing anything tied to that property.
 */
export async function requirePropertyAccess(operatorId: string, propertyId: string): Promise<void> {
  const { rows } = await getPool().query(
    `SELECT 1 FROM operator_property WHERE operator_id = $1 AND property_id = $2`,
    [operatorId, propertyId],
  );
  if (rows.length === 0) {
    throw new ForbiddenError("Operator does not have access to this property");
  }
}

export async function operatorProperties(
  operatorId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { rows } = await getPool().query(
    `SELECT p.id, p.name
       FROM operator_property op
       JOIN property p ON p.id = op.property_id
      WHERE op.operator_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.name`,
    [operatorId],
  );
  return rows;
}
