import { describe, expect, it } from "vitest";
import { db, seedPage } from "./integration-setup";
import { pages } from "@/db/schema";
import { ADMIN_CAPABILITIES, MEMBER_CAPABILITIES } from "@/lib/ownership";
import { createUser } from "@/server/queries";
import {
  getAdminPage,
  getPageSwitcherPage,
  getPageSwitcherPages,
  listAdminPages,
} from "@/server/queries/admin-pages";

describe("admin page navigation", () => {
  it("keeps member pages out of admin shortcuts and checks access when opening them", async () => {
    const admin = await createUser("directory-admin", "seed");
    const member = await createUser("directory-member", "seed");
    const own = await seedPage({ slug: "directory-admin", userId: admin.id, isDefault: false });
    const foreign = await seedPage({ slug: "directory-member", userId: member.id, isDefault: false });

    const shortcuts = await getPageSwitcherPages(ADMIN_CAPABILITIES, admin.id);
    expect(shortcuts.map((page) => page.id)).toContain(own.id);
    expect(shortcuts.map((page) => page.id)).not.toContain(foreign.id);
    expect(shortcuts[0].isDefault).toBe(true);
    expect(shortcuts[0]).not.toHaveProperty("bio");
    expect(await getAdminPage(ADMIN_CAPABILITIES, admin.id, String(foreign.id))).toMatchObject({ id: foreign.id });
    expect(await getAdminPage(MEMBER_CAPABILITIES, admin.id, String(foreign.id))).toMatchObject({ id: own.id });
    expect(await getPageSwitcherPage(ADMIN_CAPABILITIES, admin.id, foreign.id)).toMatchObject({ canEdit: false });
    expect(await getPageSwitcherPage(ADMIN_CAPABILITIES, admin.id, own.id)).toMatchObject({ canEdit: true });
    expect(await getPageSwitcherPage(MEMBER_CAPABILITIES, admin.id, foreign.id)).toBeNull();
    expect(await getPageSwitcherPage({ ...MEMBER_CAPABILITIES, visibility: "view_all" }, admin.id, foreign.id))
      .toMatchObject({ id: foreign.id, canEdit: false });
  });

  it("paginates account searches and matches literal wildcards within the caller's visibility", async () => {
    const admin = await createUser("directory-search-admin", "seed");
    const owner = await createUser("directory-search-owner", "seed");
    await db.insert(pages).values(Array.from({ length: 26 }, (_, index) => ({
      slug: `directory-search/${index}`,
      title: index === 0 ? "100% complete" : "Directory search fixture",
      userId: owner.id,
    })));

    const first = await listAdminPages(ADMIN_CAPABILITIES, admin.id, "SEARCH-OWNER", 1);
    const second = await listAdminPages(ADMIN_CAPABILITIES, admin.id, "SEARCH-OWNER", 2);
    expect(first.rows).toHaveLength(25);
    expect(first.hasNext).toBe(true);
    expect(second.rows).toHaveLength(1);
    expect(second.hasNext).toBe(false);
    expect(second.rows[0].id).toBeGreaterThan(first.rows[24].id);

    expect((await listAdminPages(MEMBER_CAPABILITIES, admin.id, "SEARCH-OWNER", 1)).rows).toEqual([]);
    const viewAll = { ...MEMBER_CAPABILITIES, visibility: "view_all" as const };
    expect((await listAdminPages(viewAll, admin.id, "SEARCH-OWNER", 1)).rows).toEqual([]);
    const literal = await listAdminPages(MEMBER_CAPABILITIES, owner.id, "%", 1);
    expect(literal.rows.map((row) => row.title)).toEqual(["100% complete"]);
    expect(literal.rows[0].owner).toBeNull();
  });
});
