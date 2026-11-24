import "server-only";

import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages, users } from "@/db/schema";
import { canEditPage, type RoleCapabilities } from "@/lib/ownership";
import { parseAdminPageId } from "@/lib/page-path";
import { ensureDefaultPage, type PageRow } from "@/server/queries";

const pageSummary = {
  id: pages.id,
  slug: pages.slug,
  title: pages.title,
  isDefault: pages.isDefault,
  isPublished: pages.isPublished,
  userId: pages.userId,
};
const pageOrder = [desc(pages.isDefault), asc(pages.orderIndex), asc(pages.id)];

export type PageSwitcherPage = Pick<PageRow, "id" | "slug" | "title" | "isDefault" | "isPublished"> & {
  canEdit: boolean;
};

function toSwitcherPage(
  page: Pick<PageRow, keyof typeof pageSummary>,
  caps: RoleCapabilities,
  userId: number,
): PageSwitcherPage {
  const { id, slug, title, isDefault, isPublished } = page;
  return { id, slug, title, isDefault, isPublished, canEdit: canEditPage(caps, { userId }, page) };
}

function visibleTo(caps: RoleCapabilities, userId: number) {
  if (caps.manageAccounts && caps.manageInstance) return undefined;
  if (caps.visibility !== "own") return isNotNull(pages.userId);
  return eq(pages.userId, userId);
}

/** Resolve the requested visible page, then the default or first visible page. */
export async function getAdminPage(caps: RoleCapabilities, userId: number, pageParam?: string) {
  const visibility = visibleTo(caps, userId);
  const requestedId = parseAdminPageId(pageParam);
  if (requestedId !== null) {
    const [requested] = await db.select().from(pages)
      .where(and(eq(pages.id, requestedId), visibility)).limit(1);
    if (requested) return requested;
  }

  const [fallback] = await db.select().from(pages).where(visibility).orderBy(...pageOrder).limit(1);
  if (fallback) return fallback;
  return visibility ? null : ensureDefaultPage();
}

export async function getPageSwitcherPage(caps: RoleCapabilities, userId: number, pageId: number) {
  const [page] = await db.select(pageSummary).from(pages)
    .where(and(eq(pages.id, pageId), visibleTo(caps, userId))).limit(1);
  return page ? toSwitcherPage(page, caps, userId) : null;
}

export async function getPageSwitcherPages(caps: RoleCapabilities, userId: number) {
  const shortcutLimit = 8;
  const [fallback, ownPages] = await Promise.all([
    getAdminPage(caps, userId),
    db.select(pageSummary).from(pages).where(eq(pages.userId, userId)).orderBy(...pageOrder).limit(shortcutLimit),
  ]);
  if (!fallback) return [];
  return [
    toSwitcherPage(fallback, caps, userId),
    ...ownPages.filter((page) => page.id !== fallback.id).slice(0, shortcutLimit - 1)
      .map((page) => toSwitcherPage(page, caps, userId)),
  ];
}

export async function getAdminHomeSlug(caps: RoleCapabilities, userId: number, homeSlug: string, legacyAdmin: boolean) {
  const matchesHome = sql`lower(${pages.slug}) = ${homeSlug}`;
  const owned = eq(pages.userId, userId);
  const eligible = legacyAdmin && caps.manageAccounts && caps.manageInstance
    ? or(owned, and(isNull(pages.userId), eq(pages.isDefault, true), matchesHome))
    : owned;
  const [home] = await db.select({ slug: pages.slug }).from(pages)
    .where(and(eq(pages.isPublished, true), eligible, or(matchesHome, sql`strpos(${pages.slug}, '/') = 0`)))
    .orderBy(desc(matchesHome), ...pageOrder).limit(1);
  return home?.slug;
}

export async function listAdminPages(caps: RoleCapabilities, userId: number, search: string, pageNumber: number) {
  const pageSize = 25;
  const owner = caps.manageAccounts ? users.username : sql<string | null>`null`;
  // Escape LIKE wildcards so searches are for the literal title, path, or username.
  const pattern = `%${search.replaceAll(/[\\%_]/g, "\\$&")}%`;
  const matchesSearch = search ? or(
    ilike(pages.slug, pattern), ilike(pages.title, pattern), ilike(owner, pattern),
  ) : undefined;

  const rows = await db.select({ ...pageSummary, owner }).from(pages)
    .leftJoin(users, eq(pages.userId, users.id))
    .where(and(visibleTo(caps, userId), matchesSearch))
    .orderBy(asc(pages.id))
    .limit(pageSize + 1).offset((pageNumber - 1) * pageSize);
  return { rows: rows.slice(0, pageSize), hasNext: rows.length > pageSize };
}
