import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../../queries/__tests__/integration-setup";
import { db, seedPage, seedTheme } from "../../queries/__tests__/integration-setup";
import { pages, themes, users } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { applyTheme, deleteCustomTheme, duplicateActiveTheme } from "@/server/actions/theme";
import { compileThemeCss } from "@/server/compile-theme-css";
import { oceanSource } from "@/lib/custom-theme";
import { getThemeLibrary } from "@/server/queries";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/demo", () => ({ demoBlock: vi.fn(() => null) }));

let member: typeof users.$inferSelect;
let other: typeof users.$inferSelect;

beforeAll(async () => {
  member = (await db.insert(users).values({ username: "member", passwordHash: "seed" }).returning())[0];
  other = (await db.insert(users).values({ username: "other", passwordHash: "seed" }).returning())[0];
});

function signIn(user: typeof member | null) {
  vi.mocked(getSession).mockResolvedValue(user && {
    userId: user.id, username: user.username, exp: Date.now() + 60_000, pv: 1,
  });
}

async function readPage(id: number) {
  return (await db.select().from(pages).where(eq(pages.id, id)).limit(1))[0];
}

async function readTheme(id: number) {
  return (await db.select().from(themes).where(eq(themes.id, id)).limit(1))[0];
}

beforeEach(async () => {
  (await db.delete(pages));
  (await db.delete(themes));
  signIn(member);
});

describe("applyTheme", () => {
  it("publishes a compiled Ocean design to an owned copy and preserves it on failed edits", async () => {
    const preset = await seedTheme({ isPreset: true });
    const page = await seedPage({ slug: "surf", userId: member.id });
    const compiled = compileThemeCss(oceanSource);
    if ("error" in compiled) throw new Error(compiled.error);
    const input = { themeId: preset.id, pageId: page.id, fields: compiled, copyName: "Ocean" };
    const saved = await applyTheme(input);
    if (!saved.success) throw new Error(saved.error);
    expect((await readTheme(saved.themeId))?.design).toBe(compiled.design);
    expect((await readTheme(preset.id))?.design).toBe("");
    const edit = { pageId: page.id, themeId: saved.themeId };
    expect((await applyTheme({ ...edit, fields: { design: "invalid" } })).success).toBe(false);
    signIn(other);
    expect((await applyTheme({ ...edit, fields: { design: "" } })).success).toBe(false);
    expect((await readTheme(saved.themeId))?.design).toBe(compiled.design);
  });

  it("applies a preset without allocating a custom theme and denies access across accounts", async () => {
    const preset = (await seedTheme({ isPreset: true }));
    const page = (await seedPage({ slug: "member", userId: member.id }));
    const otherPage = (await seedPage({ slug: "other", userId: other.id }));
    const privateTheme = (await seedTheme({ isActive: false, ownerId: other.id }));

    expect(await applyTheme({ pageId: page.id, themeId: preset.id })).toEqual({ success: true, themeId: preset.id });
    expect((await readPage(page.id))?.themeId).toBe(preset.id);
    expect((await db.select().from(themes))).toHaveLength(2);

    expect(await applyTheme({ pageId: otherPage.id, themeId: preset.id })).toMatchObject({ errorCode: "forbidden" });
    expect(await applyTheme({ pageId: page.id, themeId: privateTheme.id })).toMatchObject({ errorCode: "not_found" });
    expect(await applyTheme({ themeId: preset.id })).toMatchObject({ errorCode: "forbidden" });
    signIn(null);
    expect(await applyTheme({ pageId: page.id, themeId: preset.id })).toMatchObject({ errorCode: "unauthorized" });
  });

  it("saves a private copy, keeps it in the library after switching, and updates it in place", async () => {
    const preset = (await seedTheme({ isPreset: true, primaryColor: "#111111" }));
    const first = (await seedPage({ slug: "first", userId: member.id, themeId: preset.id }));
    const second = (await seedPage({ slug: "second", userId: other.id, themeId: preset.id }));
    const input = { pageId: first.id, themeId: preset.id, fields: { primaryColor: "#123456" } };

    expect(await applyTheme(input)).toMatchObject({ needsCopyName: true });
    expect(await applyTheme({ ...input, fields: { primaryColor: "invalid" }, copyName: "My style" }))
      .toMatchObject({ errorCode: "validation" });
    expect((await db.select().from(themes))).toHaveLength(1);
    const saved = await applyTheme({ ...input, copyName: "My style" });
    if (!saved.success) throw Error(saved.error);
    expect((await readPage(first.id))?.themeId).toBe(saved.themeId);
    expect((await readPage(second.id))?.themeId).toBe(preset.id);
    expect((await readTheme(preset.id))?.primaryColor).toBe("#111111");
    expect((await readTheme(saved.themeId))).toMatchObject({ ownerId: member.id, primaryColor: "#123456", isPreset: false });

    expect(await applyTheme({ pageId: first.id, themeId: preset.id })).toMatchObject({ success: true });
    expect((await getThemeLibrary(member.id)).map((theme) => theme.id)).toContain(saved.themeId);
    expect((await getThemeLibrary(other.id)).map((theme) => theme.id)).not.toContain(saved.themeId);
    expect(await applyTheme({
      pageId: first.id, themeId: saved.themeId, fields: { textColor: "#123abc" },
    })).toEqual({ success: true, themeId: saved.themeId });
    expect((await readTheme(saved.themeId))?.textColor).toBe("#123abc");
    expect((await db.select().from(themes))).toHaveLength(2);
  });

  it("copies a custom theme shared by two pages before editing", async () => {
    const shared = (await seedTheme({ ownerId: member.id, isActive: false, primaryColor: "#111111" }));
    const first = (await seedPage({ slug: "first", themeId: shared.id, userId: member.id }));
    const second = (await seedPage({ slug: "second", themeId: shared.id, userId: member.id }));
    const input = { pageId: first.id, themeId: shared.id, fields: { primaryColor: "#123456" } };

    expect(await applyTheme(input)).toMatchObject({ needsCopyName: true });
    const result = await applyTheme({ ...input, copyName: "First page style" });
    expect(result.success).toBe(true);
    expect((await readTheme(shared.id))?.primaryColor).toBe("#111111");
    expect((await readPage(first.id))?.themeId).not.toBe(shared.id);
    expect((await readPage(second.id))?.themeId).toBe(shared.id);
  });

  it("rolls a new theme back when assigning it fails", async () => {
    const preset = (await seedTheme({ isPreset: true }));
    const page = (await seedPage({ userId: member.id, themeId: preset.id }));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.execute(sql`ALTER TABLE pages ADD CONSTRAINT block_theme_assignment
      CHECK (theme_id IS NULL OR theme_id = ${sql.raw(String(preset.id))})`);
    try {
      expect(await applyTheme({
        themeId: preset.id, pageId: page.id, copyName: "Rolled back", fields: { primaryColor: "#123456" },
      })).toMatchObject({ errorCode: "internal" });
      expect((await readPage(page.id))?.themeId).toBe(preset.id);
      expect((await db.select().from(themes))).toHaveLength(1);
    } finally {
      await db.execute(sql`ALTER TABLE pages DROP CONSTRAINT block_theme_assignment`);
      consoleSpy.mockRestore();
    }
  });

  it("commits only one copy when two requests save the same name", async () => {
    const preset = (await seedTheme({ isPreset: true }));
    const first = (await seedPage({ slug: "first", userId: member.id, themeId: preset.id }));
    const second = (await seedPage({ slug: "second", userId: member.id, themeId: preset.id }));
    const results = await Promise.all([first.id, second.id].map((pageId) => applyTheme({
      themeId: preset.id, pageId, copyName: "Shared name", fields: { primaryColor: "#123abc" },
    })));
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results).toContainEqual(expect.objectContaining({ success: false, errorCode: "conflict" }));
    expect((await db.select().from(themes))).toHaveLength(2);
    expect([(await readPage(first.id))?.themeId, (await readPage(second.id))?.themeId]).toContain(preset.id);
  });

  it("saves a page background adjustment without creating a theme or overriding inheritance", async () => {
    const preset = (await seedTheme({ isPreset: true, backgroundType: "image", backgroundImageUrl: "/image.jpg" }));
    const page = (await seedPage({ userId: member.id }));
    const background = { fit: "contain", posX: 0.1, posY: 0.2, zoom: 2 } as const;

    expect(await applyTheme({ themeId: preset.id, pageId: page.id, background })).toMatchObject({ success: true });
    expect((await readPage(page.id))).toMatchObject({ themeId: null, backgroundFitOverride: "contain", backgroundZoom: 2 });
    expect((await db.select().from(themes))).toHaveLength(1);
    const next = (await seedTheme({ isPreset: true, isActive: false, backgroundImageUrl: "/other.jpg" }));
    expect(await applyTheme({ themeId: next.id, pageId: page.id })).toMatchObject({ success: true });
    expect((await readPage(page.id))).toMatchObject({ themeId: next.id, backgroundFitOverride: null, backgroundZoom: null });
  });
});

describe("saved theme management", () => {
  it("duplicates and deletes unused owned themes and scopes name conflicts to the account", async () => {
    const preset = (await seedTheme({ isPreset: true }));
    const page = (await seedPage({ userId: member.id, themeId: preset.id }));
    (await seedTheme({ name: "Library style", isActive: false, ownerId: other.id }));

    const copy = await duplicateActiveTheme("Library style", preset.id);
    if (!copy.success) throw Error(copy.error);
    expect((await readTheme(copy.themeId))).toMatchObject({
      name: "Library style", ownerId: member.id, isPreset: false, isActive: false,
    });
    expect((await readPage(page.id))?.themeId).toBe(preset.id);
    expect((await getThemeLibrary(member.id)).map((theme) => theme.id)).toContain(copy.themeId);
    expect(await duplicateActiveTheme("Library style", preset.id)).toMatchObject({ errorCode: "conflict" });
    signIn(other);
    expect(await deleteCustomTheme(copy.themeId)).toMatchObject({ errorCode: "not_found" });
    signIn(member);
    expect(await deleteCustomTheme(copy.themeId)).toEqual({ success: true });
    expect((await readTheme(copy.themeId))).toBeUndefined();
  });
});
