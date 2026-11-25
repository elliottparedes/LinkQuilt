import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";

export const migrationsFolder = join(process.cwd(), "src", "db", "postgres");
export const importKey = "sqlite_import_v1";
const freshInstallKey = "postgres_initialized_v1";

/** @param {import("pg").ClientBase} client */
export async function migratePostgres(client) {
  await migrate(drizzle(client), { migrationsFolder });
}

/**
 * @template T
 * @param {import("pg").ClientBase} client
 * @param {() => Promise<T>} work
 */
export async function withSchemaLock(client, work) {
  await client.query("SELECT pg_advisory_lock(167284233, 1)");
  try {
    return await work();
  } finally {
    await client.query("SELECT pg_advisory_unlock(167284233, 1)");
  }
}

/**
 * @param {import("pg").ClientBase} client
 * @param {boolean} hasLegacyDatabase
 */
export async function initializePostgres(client, hasLegacyDatabase) {
  const { rows } = await client.query(
    "SELECT key FROM _meta WHERE key IN ($1, $2)",
    [importKey, freshInstallKey],
  );
  if (rows.some((row) => row.key === importKey)) return;
  if (hasLegacyDatabase) {
    throw new Error("Legacy SQLite database found. Run the SQLite importer against an empty PostgreSQL database before starting LinkBreeze.");
  }
  if (rows.some((row) => row.key === freshInstallKey)) return;

  await client.query("BEGIN");
  try {
    await client.query(`
      INSERT INTO roles (name, is_builtin, pages_limit, pages_visibility, can_manage_accounts, can_manage_instance)
      VALUES ('Admin', true, NULL, 'view_all', true, true), ('Member', true, 5, 'own', false, false)
      ON CONFLICT (name) DO NOTHING
    `);
    await client.query(`
      INSERT INTO pages (slug, is_default, is_published)
      SELECT 'u', true, true WHERE NOT EXISTS (SELECT 1 FROM pages)
    `);
    await client.query("INSERT INTO _meta (key, value) VALUES ($1, 'true')", [freshInstallKey]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
