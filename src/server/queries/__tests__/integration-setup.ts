/** Each test file gets its own PostgreSQL database on the test server. */
import { afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { initializePostgres, migratePostgres } from "@/db/bootstrap.mjs";
import * as schema from "@/db/schema";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL server with a CREATEDB role.");
const database = `linkbreeze_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString, connectionTimeoutMillis: 2_000 });
await admin.connect();
await admin.query(`CREATE DATABASE "${database}"`);
const testUrl = new URL(connectionString);
testUrl.pathname = `/${database}`;
const pool = new Pool({ connectionString: testUrl.toString(), max: 3 });
let queryCount = 0;
const db = drizzle(pool, { schema, logger: { logQuery: () => { queryCount++; } } });

export async function countQueries(work: () => Promise<void>): Promise<number> {
  const before = queryCount;
  await work();
  return queryCount - before;
}

afterAll(async () => {
  await pool.end();
  try {
    await admin.query(`DROP DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
});

const client = await pool.connect();
try {
  await migratePostgres(client);
  await initializePostgres(client, false);
} finally {
  client.release();
}
await db.insert(schema.users).values({ username: "admin", passwordHash: "seed", role: "admin" });

vi.mock("@/db", () => ({ db, pool, schema }));
// Mock the singleton that was already loaded
vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => ({ userId: 1, username: "admin", exp: Date.now() + 60000, pv: 1 })),
  hashPassword: vi.fn(async (s: string) => `hashed-${s}`),
  verifyPassword: vi.fn(async () => true),
  createSession: vi.fn(async () => {}),
  destroySession: vi.fn(async () => {}),
}));

export { db, schema };

export async function seedPage(overrides: Partial<typeof schema.pages.$inferInsert> = {}) {
  return (await db
    .insert(schema.pages)
    .values({
      slug: "test-page",
      title: "Test Page",
      bio: "Test bio",
      isDefault: true,
      isPublished: true,
      socialLinks: "[]",
      ...overrides,
    })
    .returning())[0];
}

export async function seedTheme(overrides: Partial<typeof schema.themes.$inferInsert> = {}) {
  return (await db
    .insert(schema.themes)
    .values({
      name: "Test Theme",
      isActive: true,
      isPreset: false,
      ...overrides,
    })
    .returning())[0];
}

export async function seedLink(overrides: Partial<typeof schema.links.$inferInsert> = {}) {
  return (await db
    .insert(schema.links)
    .values({
      pageId: 1,
      title: "Test Link",
      url: "https://example.com",
      type: "url",
      orderIndex: 0,
      isActive: true,
      ...overrides,
    })
    .returning())[0];
}
