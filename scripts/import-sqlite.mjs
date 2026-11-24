import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { Client } from "pg";
import { importKey, migratePostgres, withSchemaLock } from "../src/db/bootstrap.mjs";

const legacyMigrations = join(process.cwd(), "src", "db", "migrations");
const tables = [
  "roles", "users", "profile", "settings", "themes", "custom_fonts", "pages",
  "link_sections", "links", "domains", "analytics_pageviews", "analytics_clicks",
  "analytics_social_clicks", "subscribers", "audit_log", "invites",
  "oidc_identities", "oidc_states", "_meta",
];
const batchSize = 200;

function identifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function migrateLegacyCopy(sqlite) {
  const journal = JSON.parse(await readFile(join(legacyMigrations, "meta", "_journal.json"), "utf8"));
  const applied = new Set(sqlite.prepare("SELECT hash FROM __drizzle_migrations").all().map(({ hash }) => hash));
  const files = await Promise.all(journal.entries.map(async ({ tag }) => {
    const sql = (await readFile(join(legacyMigrations, `${tag}.sql`), "utf8")).replaceAll("\r\n", "\n");
    const digest = (input) => createHash("sha256").update(input).digest("hex");
    return { sql, applied: applied.has(digest(sql)) || applied.has(digest(sql.replaceAll("\n", "\r\n"))) };
  }));
  if (!files.some((file) => file.applied)) throw new Error("SQLite migration history is unrecognized.");
  sqlite.exec("PRAGMA foreign_keys = OFF; BEGIN");
  try {
    for (const file of files) if (!file.applied) sqlite.exec(file.sql);
    sqlite.exec("COMMIT; PRAGMA foreign_keys = ON");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
  const violation = sqlite.prepare("PRAGMA foreign_key_check").get();
  if (violation) throw new Error(`Broken SQLite foreign key in ${violation.table}.`);
}

function validateValue(value, column, table) {
  if (value === null && column.is_nullable === "YES") return null;
  switch (column.data_type) {
    case "boolean":
      if (value === 0 || value === 1) return value === 1;
      break;
    case "integer":
      if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) return value;
      break;
    case "double precision":
      if (Number.isFinite(value)) return value;
      break;
    case "text":
      if (typeof value === "string" && !value.includes("\0")) return value;
      break;
  }
  throw new Error(`Invalid SQLite value for ${table}.${column.column_name}.`);
}

async function copyTable(sqlite, client, table) {
  const quotedTable = identifier(table);
  const { rows: columns } = await client.query(`
    SELECT column_name, data_type, is_nullable, is_identity
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  let sourceColumns = sqlite.prepare(`PRAGMA table_info(${quotedTable})`).all();
  // A local development migration added this nullable column outside the
  // legacy journal. Omit it only when the snapshot has no data in it.
  if (table === "links" && sourceColumns.some(({ name }) => name === "description_alignment")) {
    if (sqlite.prepare("SELECT 1 FROM links WHERE description_alignment IS NOT NULL LIMIT 1").get()) {
      throw new Error("SQLite links.description_alignment contains data and needs an explicit mapping.");
    }
    sourceColumns = sourceColumns.filter(({ name }) => name !== "description_alignment");
  }
  const targetNames = new Set(columns.map(({ column_name }) => column_name));
  if (sourceColumns.length !== columns.length || sourceColumns.some(({ name }) => !targetNames.has(name))) {
    throw new Error(`SQLite and PostgreSQL columns differ for ${table}.`);
  }

  const pk = sourceColumns.find(({ pk }) => pk === 1)?.name;
  if (!pk) throw new Error(`No primary key for ${table}.`);
  const names = columns.map(({ column_name }) => column_name);
  const keyIndex = names.indexOf(pk);
  const fields = names.map(identifier).join(", ");
  const key = identifier(pk);
  const sourceHash = createHash("sha256");
  const targetHash = createHash("sha256");
  let count = 0;
  let batch = [];
  let maxId = 0;

  async function flush() {
    if (!batch.length) return;
    const placeholders = batch.map((row, index) =>
      `(${row.map((_, i) => `$${index * names.length + i + 1}`).join(", ")})`
    ).join(", ");
    await client.query(`INSERT INTO ${quotedTable} (${fields}) VALUES ${placeholders}`, batch.flat());
    const keys = batch.map((row) => row[keyIndex]);
    const { rows } = await client.query(`SELECT ${fields} FROM ${quotedTable} WHERE ${key} = ANY($1)`, [keys]);
    const imported = new Map(rows.map((row) => [row[pk], names.map((name) => row[name])]));
    for (const row of batch) {
      const actual = imported.get(row[keyIndex]);
      if (!actual) throw new Error(`Missing imported row in ${table}.`);
      sourceHash.update(`${JSON.stringify(row)}\n`);
      targetHash.update(`${JSON.stringify(actual)}\n`);
    }
    count += batch.length;
    batch = [];
  }

  for (const row of sqlite.prepare(`SELECT ${fields} FROM ${quotedTable} ORDER BY ${key}`).iterate()) {
    batch.push(columns.map((column) => validateValue(row[column.column_name], column, table)));
    if (typeof row[pk] === "number") maxId = Math.max(maxId, row[pk]);
    if (batch.length === batchSize) await flush();
  }
  await flush();

  const { rows: [total] } = await client.query(`SELECT count(*) AS total FROM ${quotedTable}`);
  const digest = sourceHash.digest("hex");
  if (Number(total.total) !== count || digest !== targetHash.digest("hex")) {
    throw new Error(`Count or digest mismatch for ${table}.`);
  }
  if (columns[keyIndex].is_identity === "YES") {
    const seq = sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table)?.seq ?? 0;
    const next = Math.max(maxId, seq) + 1;
    if (!Number.isSafeInteger(next) || next > 2147483647) throw new Error(`Identity exhausted for ${table}.`);
    await client.query(`ALTER TABLE ${quotedTable} ALTER COLUMN ${key} RESTART WITH ${next}`);
  }
  return { count, digest };
}

async function importSnapshot(sqlite, client) {
  const sourceTables = new Set(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map(({ name }) => name));
  for (const name of [...tables, "sqlite_sequence", "__drizzle_migrations"]) {
    if (!sourceTables.delete(name)) throw new Error(`Missing SQLite table ${name}.`);
  }
  if (sourceTables.size) throw new Error(`Unexpected SQLite tables: ${[...sourceTables].join(", ")}.`);

  await client.query("BEGIN");
  try {
    // Hold exclusive locks before checking the empty target and until the import is committed.
    await client.query(`LOCK TABLE ${tables.map(identifier).join(", ")} IN ACCESS EXCLUSIVE MODE`);
    if ((await client.query("SELECT 1 FROM _meta WHERE key = $1", [importKey])).rowCount) {
      await client.query("ROLLBACK");
      console.log("SQLite import already completed for this PostgreSQL database.");
      return;
    }
    for (const table of tables) {
      if ((await client.query(`SELECT 1 FROM ${identifier(table)} LIMIT 1`)).rowCount) {
        throw new Error(`Destination table ${table} is not empty.`);
      }
    }
    const manifest = {};
    for (const table of tables) manifest[table] = await copyTable(sqlite, client, table);
    await client.query("INSERT INTO _meta (key, value) VALUES ($1, $2)", [importKey, JSON.stringify(manifest)]);
    await client.query("COMMIT");
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

const [filename, ...extraArgs] = process.argv.slice(2);
if (!filename || extraArgs.length || !process.env.DATABASE_URL) {
  console.error("Usage: set DATABASE_URL, then run node scripts/import-sqlite.mjs <sqlite-file>");
  process.exit(1);
}

const temporary = await mkdtemp(join(tmpdir(), "linkbreeze-import-"));
const snapshot = join(temporary, "source.db");
try {
  const source = new DatabaseSync(filename, { readOnly: true });
  try {
    await backup(source, snapshot);
  } finally {
    source.close();
  }

  const sqlite = new DatabaseSync(snapshot);
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000, lock_timeout: 10_000 });
  try {
    await migrateLegacyCopy(sqlite);
    await client.connect();
    await withSchemaLock(client, async () => {
      await migratePostgres(client);
      await importSnapshot(sqlite, client);
    });
  } finally {
    await client.end();
    sqlite.close();
  }
} catch (error) {
  console.error(`SQLite import failed: ${error.code ?? error.message}${error.table ? ` (${error.table})` : ""}`);
  process.exitCode = 1;
} finally {
  await rm(snapshot, { force: true });
  await rm(`${snapshot}-wal`, { force: true });
  await rm(`${snapshot}-shm`, { force: true });
  await rm(`${snapshot}-journal`, { force: true });
  await rmdir(temporary);
}
