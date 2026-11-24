import { sql } from "drizzle-orm";

// Match the UTC, second-precision text format used by the legacy database.
export const utcNow = sql`to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;

export function utcDaysAgo(days: number) {
  return sql`to_char((statement_timestamp() AT TIME ZONE 'UTC') - ${days}::double precision * interval '1 day', 'YYYY-MM-DD HH24:MI:SS')`;
}
