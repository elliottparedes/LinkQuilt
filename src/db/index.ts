import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const runtime = globalThis as typeof globalThis & { linkbreezeDatabasePool?: Pool };

export const pool = runtime.linkbreezeDatabasePool ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 2_000,
  statement_timeout: 5_000,
  idle_in_transaction_session_timeout: 10_000,
});

if (!pool.listenerCount("error")) {
  pool.on("error", (error: NodeJS.ErrnoException) => {
    console.error("[db] Idle PostgreSQL connection closed", error.code ?? error.name);
  });
}

export const db = drizzle(pool, { schema });
export { schema };
