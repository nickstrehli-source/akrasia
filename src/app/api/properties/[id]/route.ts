import { NextRequest, NextResponse } from "next/server";
import { getSessionOperator, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { requirePropertyAccess, ForbiddenError } from "@/lib/auth/access";
import { getPool } from "@/db/client";
import { withRouteErrorLogging } from "@/lib/log";

// Reference implementation of a property-scoped server action: every route
// touching a specific property must resolve the session, then call
// requirePropertyAccess before doing any read/write.
async function handleGet(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getSessionOperator(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requirePropertyAccess(session.operatorId, id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      // 404, not 403 — don't confirm to an unauthorized caller that the
      // property id even exists.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }

  const { rows } = await getPool().query(
    `SELECT id, name, address_line1, city, region, postal_code, country
       FROM property WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}

export const GET = withRouteErrorLogging("properties/[id]#GET", handleGet);
