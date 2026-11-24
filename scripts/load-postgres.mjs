import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Client } from "pg";

const [command, target] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !["seed", "run"].includes(command)) {
  throw new Error("Set DATABASE_URL to the rehearsal database, then use load-postgres.mjs seed or run <private-app-url>.");
}

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5_000 });
const key = "postgres_load_fixture";
let fixture;
await client.connect();
try {
  const { rows: [database] } = await client.query("SELECT current_database() AS name");
  if (!/^linkbreeze_load_[a-z0-9_]+$/.test(database.name)) {
    throw new Error("Use a disposable PostgreSQL database named linkbreeze_load_<name>.");
  }
  const { rows: [metadata] } = await client.query("SELECT value FROM _meta WHERE key = $1", [key]);
  fixture = metadata && JSON.parse(metadata.value);
  if (command === "seed" && !fixture) {
    await client.query("BEGIN");
    try {
      const { rows: [counts] } = await client.query("SELECT count(*)::integer AS accounts FROM users");
      if (counts.accounts !== 1) throw new Error("Run setup on the private rehearsal instance before seeding.");
      const marker = `load-fixture-${randomUUID()}`;
      await client.query(`
        INSERT INTO users (username, page_namespace, password_hash, role_id)
        SELECT 'load-creator-' || n, 'load-creator-' || n, '!fixture', roles.id
        FROM generate_series(1, 5000) AS n CROSS JOIN roles WHERE roles.name = 'Member'
      `);
      await client.query(`
        INSERT INTO pages (user_id, slug, title, bio)
        SELECT id, page_namespace, 'Sample creator', $1
        FROM users WHERE page_namespace LIKE 'load-creator-%'
      `, [marker]);
      await client.query(`
        INSERT INTO links (page_id, title, url, redirect_slug, order_index, auto_icon)
        SELECT pages.id, 'Sample link ' || n, 'https://example.com/', pages.slug || '-link-' || n, n, false
        FROM pages CROSS JOIN generate_series(1, 5) AS n WHERE pages.slug LIKE 'load-creator-%'
      `);
      await client.query(`
        INSERT INTO analytics_pageviews (page_id, visitor_hash, date, created_at)
        SELECT pages.id, md5(pages.slug || n), to_char(stamp, 'YYYY-MM-DD'), to_char(stamp, 'YYYY-MM-DD HH24:MI:SS')
        FROM pages CROSS JOIN generate_series(1, 100) AS n
        CROSS JOIN LATERAL (SELECT (statement_timestamp() AT TIME ZONE 'UTC') - (n % 89) * interval '1 day' AS stamp) AS history
        WHERE pages.slug LIKE 'load-creator-%'
      `);
      const { rows } = await client.query(`
        SELECT id FROM links WHERE redirect_slug LIKE 'load-creator-%-link-1' ORDER BY id
      `);
      fixture = { marker, linkIds: rows.map(({ id }) => id) };
      await client.query("INSERT INTO _meta (key, value) VALUES ($1, $2)", [key, JSON.stringify(fixture)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    console.log("Seeded 5,000 creators, 25,000 links and 500,000 historical pageviews.");
  }
} finally {
  await client.end();
}

if (command === "seed") process.exit(0);
if (!fixture || !target || !process.env.LINKBREEZE_LOAD_API_KEY) throw new Error("Seed first, then supply a private app URL and its API key.");
const base = new URL(target);
const verification = await fetch(new URL("/load-creator-1", base), { signal: AbortSignal.timeout(5_000) });
if (!verification.ok || !(await verification.text()).includes(fixture.marker)) {
  throw new Error("The app does not serve the fixture from the selected rehearsal database.");
}

const seconds = Number(process.env.LINKBREEZE_LOAD_SECONDS ?? 1800);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800) throw new Error("Invalid load duration.");
const rates = {
  reads: Number(process.env.LINKBREEZE_LOAD_READ_RPS ?? 100),
  clicks: Number(process.env.LINKBREEZE_LOAD_CLICK_RPS ?? 20),
  writes: Number(process.env.LINKBREEZE_LOAD_WRITE_RPS ?? 2),
};
if (Object.values(rates).some((rate) => !Number.isInteger(rate) || rate < 0 || rate > 100) || !rates.reads) {
  throw new Error("Load rates must be whole numbers from zero to 100, with at least one read per second.");
}
const transport = base.protocol === "https:" ? https : http;
const connections = new transport.Agent({ keepAlive: true, maxSockets: 32 });
const agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
const elapsed = [];
const totals = { reads: 0, clicks: 0, writes: 0, errors: 0 };
const failures = {};
const expected = seconds * Object.values(rates).reduce((total, rate) => total + rate, 0);
const ticksPerSecond = Math.max(...Object.values(rates));
const pending = new Set();
let sequence = Math.floor(Math.random() * 131_000);
const started = performance.now();

function send(kind, path, status, options = {}) {
  function fail(reason) {
    totals.errors++;
    failures[reason] = (failures[reason] ?? 0) + 1;
  }
  if (pending.size >= 256) { fail("backlog"); return; }
  const address = ++sequence % 131_000;
  const ip = `198.${18 + (address >> 16)}.${(address >> 8) & 255}.${address & 255}`;
  const start = performance.now();
  const request = new Promise((resolve, reject) => {
    const req = transport.request(new URL(path, base), {
      method: options.method, agent: connections, signal: AbortSignal.timeout(5_000),
      headers: { ...options.headers, "accept-encoding": "gzip", "user-agent": agent, "x-forwarded-for": ip },
    }, (response) => {
      response.on("error", reject);
      response.on("end", () => {
        totals[kind]++;
        if (kind === "reads") elapsed.push(performance.now() - start);
        if (response.statusCode !== status) fail(`HTTP ${response.statusCode}`);
        resolve();
      });
      response.resume();
    });
    req.on("error", reject);
    req.end(options.body);
  }).catch((error) => { fail(error.code ?? error.name); }).finally(() => { pending.delete(request); });
  pending.add(request);
}

// Maintain an even arrival rate from a separate load generator, with 80% of
// page traffic concentrated on 20 creators.
for (let tick = 0; tick < seconds * ticksPerSecond; tick++) {
  const remaining = started + tick * 1000 / ticksPerSecond - performance.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  const creator = 1 + Math.floor(Math.random() * (Math.random() < 0.8 ? 20 : 5000));
  const due = (rate) => Math.floor((tick + 1) * rate / ticksPerSecond) > Math.floor(tick * rate / ticksPerSecond);
  if (due(rates.reads)) send("reads", `/load-creator-${creator}`, 200);
  if (due(rates.clicks)) send("clicks", `/go/load-creator-${creator}-link-1`, 302);
  if (due(rates.writes)) {
    const id = fixture.linkIds[Math.floor(tick * rates.writes / ticksPerSecond) % fixture.linkIds.length];
    const body = JSON.stringify({ title: `Load test edit ${tick}` });
    send("writes", `/api/v1/links/${id}`, 200, {
      method: "PUT", headers: {
        authorization: `Bearer ${process.env.LINKBREEZE_LOAD_API_KEY}`,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      }, body,
    });
  }
}
await Promise.all(pending);
connections.destroy();
elapsed.sort((a, b) => a - b);
const p95 = elapsed[Math.ceil(elapsed.length * 0.95) - 1] ?? Infinity;
console.log({ ...totals, requests: expected, p95Milliseconds: p95, errorRate: totals.errors / expected, failures });
if (p95 >= 250 || totals.errors / expected >= 0.005) process.exitCode = 1;
