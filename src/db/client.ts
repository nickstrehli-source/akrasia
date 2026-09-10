import { Pool, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  // Recreate rather than reuse an ended pool: test files each call
  // closeDb() -> pool.end() in their own afterAll, but this module's
  // singleton can outlive a single test file (Vitest doesn't guarantee a
  // fresh module registry per file), so the next file's first query would
  // otherwise hit "Cannot use a pool after calling end on the pool".
  if (!pool || pool.ended) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
  return getPool().query<T>(text, params);
}
