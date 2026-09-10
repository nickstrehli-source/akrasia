import { getPool } from "@/db/client";
import { hashPassword } from "@/lib/auth/password";

let propertyCounter = 0;

export async function createOperator(params: {
  email: string;
  name?: string;
  password?: string;
}): Promise<string> {
  const passwordHash = params.password ? await hashPassword(params.password) : "";
  const { rows } = await getPool().query(
    `INSERT INTO operator (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id`,
    [params.email, params.name ?? "Test Operator", passwordHash],
  );
  return rows[0].id as string;
}

export async function createProperty(ownerOperatorId: string, name?: string): Promise<string> {
  propertyCounter += 1;
  const { rows } = await getPool().query(
    `INSERT INTO property
       (owner_operator_id, name, address_line1, city, region, postal_code, country)
     VALUES ($1, $2, '1 Test St', 'Austin', 'TX', '78701', 'US')
     RETURNING id`,
    [ownerOperatorId, name ?? `Test Property ${propertyCounter}`],
  );
  return rows[0].id as string;
}

export async function grantAccess(
  operatorId: string,
  propertyId: string,
  role: "owner" | "manager" = "owner",
): Promise<void> {
  await getPool().query(
    `INSERT INTO operator_property (operator_id, property_id, role) VALUES ($1, $2, $3)`,
    [operatorId, propertyId, role],
  );
}
