import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function createDatabase(connectionString: string, ssl: boolean) {
  const pool = new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5_000,
    query_timeout: 5_000,
  });
  return {
    pool,
    db: drizzle(pool, { schema }),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
