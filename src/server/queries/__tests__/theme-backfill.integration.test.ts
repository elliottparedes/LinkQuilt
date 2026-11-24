/**
 * Integration tests for backfillPresets:
 *  - an existing install (themes seeded by an older version) receives the
 *    missing presets on the next getActiveTheme() call
 *  - user-created themes and edited presets are never touched
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import "./integration-setup";
import { db } from "./integration-setup";
import { themes } from "@/db/schema";
import { eq } from "drizzle-orm";

// revalidatePath is a no-op in tests (server-only outside a request scope)
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { getActiveTheme, getThemeLibrary } = await import("@/server/queries");
const { PRESETS, PRESET_NAMES } = await import("@/lib/theme-presets");
const legacyPresets = PRESETS.slice(0, 11);

describe("backfillPresets — existing installs get new presets", () => {
  beforeEach(async () => {
    await db.delete(themes);
  });

  it("adds all nine presets once to an existing 11-preset library", async () => {
    await db.insert(themes).values(legacyPresets);
    await db.update(themes).set({ isActive: false }).where(eq(themes.name, "Aurora"));
    await db.update(themes).set({ isActive: true }).where(eq(themes.name, "Frutiger Aero"));

    await Promise.all([getActiveTheme(), getActiveTheme()]);

    const library = await getThemeLibrary(1);
    expect(library.map((row) => row.name)).toEqual(PRESET_NAMES);
    expect(library.filter((row) => row.isActive).map((row) => row.name)).toEqual(["Frutiger Aero"]);
  });

  it("never touches user themes or edited presets", async () => {
    // Old install with one user theme and an edited preset.
    await db.insert(themes).values(
      legacyPresets.map((p) =>
        p.name === "Aurora" ? { ...p, name: "Aurora (my edit)" } : p,
      ),
    );
    await db.insert(themes).values({
      name: "My Custom Theme",
      isPreset: false,
      isActive: true,
      backgroundType: "solid",
      backgroundValue: "#123456",
      fontFamily: "inter",
      primaryColor: "#ffffff",
      secondaryColor: "#aaaaaa",
      cardBackground: "#000000",
      cardBorderColor: "#333333",
      textColor: "#ffffff",
      mutedTextColor: "#cccccc",
      linkStyle: "pill",
      animationType: "lift",
    });

    await getActiveTheme();

    const rows = await db.select().from(themes);
    const byName = new Map(rows.map((r) => [r.name, r]));
    // User theme untouched and still active.
    expect(byName.get("My Custom Theme")).toBeDefined();
    expect(byName.get("My Custom Theme")?.isActive).toBe(true);
    // Edited (renamed) preset kept its custom name, untouched.
    expect(byName.get("Aurora (my edit)")).toBeDefined();
    // Name-based matching: renaming a preset makes it "yours", so the
    // canonical Aurora is (re-)inserted alongside it — by design.
    expect(byName.get("Aurora")).toBeDefined();
    // New preset arrived.
    expect(byName.get("Glazed Tile")).toBeDefined();
  });
});
