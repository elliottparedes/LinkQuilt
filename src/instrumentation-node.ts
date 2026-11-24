import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

function legacyDatabasePath(): string {
  return process.env.DATABASE_PATH || join(process.cwd(), "data", "linkbreeze.db");
}

export async function bootstrapNodeServer(): Promise<void> {
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;

  const { installLogRedaction } = await import("@/lib/redact-secrets");
  installLogRedaction();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to start LinkBreeze.");
  await ensureSecretKey();

  const { pool } = await import("@/db");
  const { withSchemaLock, migratePostgres, initializePostgres } = await import("@/db/bootstrap.mjs");
  const client = await pool.connect();
  try {
    await withSchemaLock(client, async () => {
      await migratePostgres(client);
      const requiresImport = process.env.LINKBREEZE_START_FRESH !== "true" &&
        existsSync(/* turbopackIgnore: true */ legacyDatabasePath());
      await initializePostgres(client, requiresImport);
    });
  } finally {
    client.release();
  }
}

// Retain the persisted signing key from the legacy database volume.
export async function ensureSecretKey(): Promise<void> {
  // If the operator provided a key, respect it and never override.
  if (process.env.SECRET_KEY) return;

  const dataDir = dirname(legacyDatabasePath());
  const keyFile = join(dataDir, ".secret-key");

  try {
    // Try to read an existing key file (persisted from a previous boot).
    if (existsSync(keyFile)) {
      const existing = readFileSync(keyFile, "utf8").trim();
      if (existing.length >= 32) {
        process.env.SECRET_KEY = existing;
        return;
      }
    }
  } catch {
    // Read failed — fall through to generation.
  }

  // Generate a new key and persist it.
  const generated = randomBytes(32).toString("hex");
  try {
    // Ensure data dir exists (it should — db/index.ts creates it — but be safe).
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(keyFile, generated, { mode: 0o600 });
    console.log(
      `[auth] No SECRET_KEY found — generated and saved to ${keyFile}.\n` +
        "       For production deployments behind a reverse proxy, set a " +
        "fixed SECRET_KEY env var for reproducibility across rebuilds.",
    );
  } catch {
    // Can't persist (read-only volume?). Still inject into the process so the
    // current boot works; it just won't survive a container recreate.
    console.warn(
      `[auth] Could not persist SECRET_KEY to ${keyFile} (volume read-only?). ` +
        "Using an ephemeral key — sessions will not survive a restart.",
    );
  }
  process.env.SECRET_KEY = generated;
}
