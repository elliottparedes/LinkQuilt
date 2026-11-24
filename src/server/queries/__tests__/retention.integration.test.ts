/** Analytics retention resolver and opportunistic PostgreSQL pruning. */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import "./integration-setup";
import { db, seedPage, seedLink } from "./integration-setup";
import {
  getAnalyticsRetentionDays,
  updateSetting,
  recordPageview,
  recordClick,
  getLink,
  getLinkStats,
  DEFAULT_ANALYTICS_RETENTION_DAYS,
} from "@/server/queries";
import { analyticsPageviews, analyticsClicks } from "@/db/schema";
import { sql, eq, inArray } from "drizzle-orm";

const DAYS = 24 * 60 * 60 * 1000;
let clock = Date.now();
beforeEach(() => {
  clock += 180_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
});
afterEach(() => vi.useRealTimers());

/** SQLite text timestamp (UTC, "YYYY-MM-DD HH:MM:SS") N days before now. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAYS).toISOString().slice(0, 19).replace("T", " ");
}

async function countPageviews(): Promise<number> {
  return ((await db.select({ c: sql<number>`count(*)`.mapWith(Number) }).from(analyticsPageviews)) as { c: number }[])[0].c;
}

async function countClicks(): Promise<number> {
  return ((await db.select({ c: sql<number>`count(*)`.mapWith(Number) }).from(analyticsClicks)) as { c: number }[])[0].c;
}

let pageId: number;
let linkId: number;

describe("[integration] pruning honours the 90-day default", () => {
  it("deletes pageviews older than the default window and keeps newer ones", async () => {
    const page = (await seedPage());
    pageId = page.id;

    // No analyticsRetentionDays setting stored — pre-test invariant.
    await db.execute(sql`DELETE FROM settings WHERE key = 'analyticsRetentionDays'`);

    (await db.insert(analyticsPageviews).values([
      { visitorHash: "old", createdAt: daysAgo(DEFAULT_ANALYTICS_RETENTION_DAYS + 10) },
      { visitorHash: "recent", createdAt: daysAgo(1) },
    ]));

    // First record* call reads the setting with a cold cache → default 90.
    await recordPageview("now", null, null, null, pageId);

    // The 100-day-old row is gone; the 1-day-old and the new one survive.
    expect((await countPageviews())).toBe(2);
    const remaining = (await db.select().from(analyticsPageviews)) as { visitorHash: string }[];
    expect(remaining.map((r) => r.visitorHash).sort()).toEqual(["now", "recent"]);
  });

  it("prunes clicks through the same opportunistic path", async () => {
    const link = (await seedLink({ pageId }));
    linkId = link.id;

    (await db.insert(analyticsClicks).values([
      { linkId, visitorHash: "old-click", createdAt: daysAgo(DEFAULT_ANALYTICS_RETENTION_DAYS + 10) },
    ]));

    vi.spyOn(Date, "now").mockReturnValueOnce(Date.now() + 61_000);
    await recordClick(linkId, "now-click", null);

    // Old click pruned, the new one kept — recordClick prunes like pageviews.
    expect((await countClicks())).toBe(1);
    const remaining = (await db.select().from(analyticsClicks)) as { visitorHash: string }[];
    expect(remaining[0].visitorHash).toBe("now-click");
  });
});

describe("[integration] retention resolver", () => {
  it("falls back to the 90-day default when no setting is stored", async () => {
    await db.execute(sql`DELETE FROM settings WHERE key = 'analyticsRetentionDays'`);
    expect(await getAnalyticsRetentionDays()).toBe(DEFAULT_ANALYTICS_RETENTION_DAYS);
  });

  it("respects a stored value", async () => {
    await updateSetting("analyticsRetentionDays", "45");
    expect(await getAnalyticsRetentionDays()).toBe(45);
  });

  it("respects an explicit 0 (keep forever)", async () => {
    await updateSetting("analyticsRetentionDays", "0");
    expect(await getAnalyticsRetentionDays()).toBe(0);
  });

  it("falls back to the default on a non-numeric stored value", async () => {
    await updateSetting("analyticsRetentionDays", "forever");
    expect(await getAnalyticsRetentionDays()).toBe(DEFAULT_ANALYTICS_RETENTION_DAYS);
  });

  it("E.97: post-prune counter honesty — clicksCount stays monotone, stats recomputes from rows", async () => {
    // Design pinned (#83-era, pre-existing): links.clicksCount is the
    // LIFETIME counter — transactionally paired with each INSERT, never
    // decremented by retention pruning. getLinkStats recomputes from the
    // REMAINING rows. After a prune the two legitimately diverge, and the
    // gap must equal EXACTLY the pruned rows (counter never lies about
    // "clicks ever", stats never lies about "rows in window").
    // Cold-cache safety: delete the setting so a hypothetical cold read
    // resolves to the 90-day default; the warm cache already holds 90.
    await db.execute(sql`DELETE FROM settings WHERE key = 'analyticsRetentionDays'`);

    const link = (await seedLink({ pageId: 1 }));
    // 15 fresh clicks through the REAL recordClick (each bumps clicksCount
    // in the same transaction as its insert).
    for (let i = 0; i < 15; i++) {
      await recordClick(link.id, `e97-${i}`, null, "click", i % 2 === 0 ? "A" : "B");
    }
    const before = (await getLink(link.id))!.clicksCount;
    expect(before).toBe(15);

    // Backdate 10 of them past the 90-day window (prunable), leaving 5.
    const ids = (await db
      .select({ id: analyticsClicks.id })
      .from(analyticsClicks)
      .where(eq(analyticsClicks.linkId, link.id))
      .limit(10))
      .map((r) => r.id);
    expect(ids.length).toBe(10);
    const oldStamp = new Date(Date.now() - 100 * DAYS).toISOString().slice(0, 19).replace("T", " ");
    (await db.update(analyticsClicks)
      .set({ createdAt: oldStamp })
      .where(inArray(analyticsClicks.id, ids)));

    // Next recordClick fires the opportunistic prune (default 90d).
    vi.spyOn(Date, "now").mockReturnValueOnce(Date.now() + 122_000);
    await recordClick(link.id, "e97-trigger", null, "click", "A");

    const row = (await getLink(link.id))!;
    const remaining = (
      (await db
        .select({ c: sql<number>`count(*)`.mapWith(Number) })
        .from(analyticsClicks)
        .where(eq(analyticsClicks.linkId, link.id))) as { c: number }[]
    )[0].c;
    const stats = (await getLinkStats(link.id, "30d"))!;

    expect(remaining).toBe(6); // 5 fresh + the trigger; 10 pruned
    expect(row.clicksCount).toBe(before + 1); // 16 — prune NEVER decrements
    expect(stats.totalClicks).toBe(remaining); // stats = rows actually present
    expect(row.clicksCount - stats.totalClicks).toBe(10); // gap == pruned, exactly
  });

  it("E.112: retention setting changes take effect after the 60s cache window — no restart", async () => {
    // The abAutoPromote toggle has NO value cache (every scan re-reads the
    // KV — covered by E.1's off/on tests); the retention reader caches for
    // 60s (pruneAnalyticsIfDue). Pin the documented propagation delay with
    // a faked Date: a change is honored by the FIRST read after the window
    // on the same process, and a prior cached value never outlives it.
    try {

      const stamp = (n: number) =>
        new Date(Date.now() - n * DAYS).toISOString().slice(0, 19).replace("T", " ");
      const link = (await seedLink({ pageId: 1 }));
      (await db.insert(analyticsClicks)
        .values([
          { linkId: link.id, visitorHash: "e112-old-1", createdAt: stamp(100) },
          { linkId: link.id, visitorHash: "e112-old-2", createdAt: stamp(100) },
        ]));

      const oldCount = async () =>
        (
          (await db
            .select({ c: sql<number>`count(*)`.mapWith(Number) })
            .from(analyticsClicks)
            .where(eq(analyticsClicks.visitorHash, "e112-old-1"))) as { c: number }[]
        )[0].c;

      // 1) keep-forever (0): first read after the window caches 0 → no prune.
      await updateSetting("analyticsRetentionDays", "0");
      await recordClick(link.id, "e112-t1", null, "click");
      expect((await oldCount()), "retention=0 must preserve the old row").toBe(1);

      // 2) switch to 7 days + expire the cache again → same process, next
      //    trigger re-reads and NOW prunes: the change landed without restart.
      await updateSetting("analyticsRetentionDays", "7");
      vi.setSystemTime(Date.now() + 61_000);
      await recordClick(link.id, "e112-t2", null, "click");
      expect((await oldCount()), "retention=7d must prune after cache expiry").toBe(0);
    } finally {
      vi.useRealTimers();
      await updateSetting("analyticsRetentionDays", "0"); // harmless default for later tests
    }
  });
});
