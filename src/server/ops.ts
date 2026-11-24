import os from "os";
import { pool } from "@/db";
import { version } from "@/lib/version";

export interface OpsAccount {
  username: string;
  status: string;
  createdAt: string;
}

export interface OpsSnapshot {
  version: string;
  uptimeSeconds: number;
  memory: { rss: number; heapUsed: number; free: number; total: number };
  databaseBytes: number;
  accounts: { total: number; active: number; disabled: number };
  signups: { day: number; week: number; month: number };
  pages: number;
  links: number;
  recentSignups: OpsAccount[];
}

/** Collect instance totals without exposing account credentials. */
export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const mem = process.memoryUsage();
  const [{ rows: [totals] }, { rows: recentSignups }] = await Promise.all([
    pool.query(`
      SELECT
        pg_database_size(current_database()) AS database_bytes,
        (SELECT count(*) FROM pages) AS pages,
        (SELECT count(*) FROM links) AS links,
        count(*) AS accounts,
        count(*) FILTER (WHERE status = 'active') AS active,
        count(*) FILTER (WHERE status = 'disabled') AS disabled,
        count(*) FILTER (WHERE created_at >= to_char(statement_timestamp() AT TIME ZONE 'UTC' - interval '1 day', 'YYYY-MM-DD HH24:MI:SS')) AS day,
        count(*) FILTER (WHERE created_at >= to_char(statement_timestamp() AT TIME ZONE 'UTC' - interval '7 days', 'YYYY-MM-DD HH24:MI:SS')) AS week,
        count(*) FILTER (WHERE created_at >= to_char(statement_timestamp() AT TIME ZONE 'UTC' - interval '30 days', 'YYYY-MM-DD HH24:MI:SS')) AS month
      FROM users
    `),
    pool.query<OpsAccount>('SELECT username, status, created_at AS "createdAt" FROM users ORDER BY id DESC LIMIT 8'),
  ]);
  return {
    version,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: { rss: mem.rss, heapUsed: mem.heapUsed, free: os.freemem(), total: os.totalmem() },
    databaseBytes: Number(totals.database_bytes),
    accounts: { total: Number(totals.accounts), active: Number(totals.active), disabled: Number(totals.disabled) },
    signups: { day: Number(totals.day), week: Number(totals.week), month: Number(totals.month) },
    pages: Number(totals.pages),
    links: Number(totals.links),
    recentSignups,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
