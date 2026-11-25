import type { SessionPayload } from "@/lib/session-token";

export type UserRole = "admin" | "owner";

/** Coerce a raw role claim (possibly absent/garbage) to a concrete role. */
export function normalizeRole(role: string | null | undefined): UserRole {
  return role === "admin" ? "admin" : "owner";
}

/** Can the actor manage accounts / global settings? Only admins. */
export function canManageAccounts(actor: { role?: UserRole | null }): boolean {
  return normalizeRole(actor.role) === "admin";
}

/** Page edit check for callers with a legacy text role. */
export function canAccessPage(
  session: Pick<SessionPayload, "userId" | "role">,
  page: { userId?: number | null } | null | undefined,
): boolean {
  return canEditPage(resolveCapabilities(session.role, null), session, page);
}

// ─── 2B: role-row capabilities ──────────────────────────────────────────────

export type PageVisibility = "own" | "view_all";

/** The subset of a roles row the resolver needs (keeps this module pure). */
export interface RoleRowLike {
  name: string;
  isBuiltin: boolean;
  pagesLimit: number | null;
  pagesVisibility: string;
  canManageAccounts: boolean;
  canManageInstance: boolean;
}

export interface RoleCapabilities {
  /** Max pages a member may own; NULL = unlimited. */
  pagesLimit: number | null;
  visibility: PageVisibility;
  manageAccounts: boolean;
  manageInstance: boolean;
}

export const ADMIN_CAPABILITIES: RoleCapabilities = {
  pagesLimit: null,
  visibility: "view_all",
  manageAccounts: true,
  manageInstance: true,
};

export const MEMBER_CAPABILITIES: RoleCapabilities = {
  pagesLimit: 5,
  visibility: "own",
  manageAccounts: false,
  manageInstance: false,
};

/** The Pages switcher is for people who can open more than one page.
 *  A one-page member has nothing to switch, so the section stays hidden. */
export function showPageSwitcher(caps: RoleCapabilities): boolean {
  if (caps.visibility !== "own") return true;
  return caps.pagesLimit == null || caps.pagesLimit > 1;
}

/** Older role rows stored cross-account access as manage_all. */
export function pageVisibility(raw: string): PageVisibility {
  return raw === "view_all" || raw === "manage_all" ? "view_all" : "own";
}

/**
 * Collapse (legacy text role, role row) into concrete capabilities.
 *
 * Order of authority:
 *  1. Builtin Admin row → ALWAYS ADMIN_CAPABILITIES (immune to stripping).
 *  2. Custom/builtin Member row → its own flags (garbage visibility → 'own').
 *  3. No row → legacy text mapping ('admin' → Admin, everything else →
 *     Member). Unknown/absent text denies by default.
 */
export function resolveCapabilities(
  roleText: string | null | undefined,
  roleRow: RoleRowLike | null | undefined,
): RoleCapabilities {
  if (roleRow) {
    if (roleRow.isBuiltin && roleRow.name === "Admin") return ADMIN_CAPABILITIES;
    return {
      pagesLimit: roleRow.pagesLimit ?? null,
      visibility: pageVisibility(roleRow.pagesVisibility),
      manageAccounts: !!roleRow.canManageAccounts,
      manageInstance: !!roleRow.canManageInstance,
    };
  }
  return normalizeRole(roleText) === "admin" ? ADMIN_CAPABILITIES : MEMBER_CAPABILITIES;
}

type PageRef = { userId?: number | null } | null | undefined;
type Actor = { userId: number };

/**
 * May this actor READ this page? Admin capabilities pass for every
 * owned page; view_all passes for owned pages but legacy (userId NULL) rows
 * stay admin-only; own = only their own rows.
 */
export function canViewPage(
  caps: RoleCapabilities,
  actor: Actor,
  page: PageRef,
): boolean {
  if (!page) return false;
  if (caps.manageAccounts && caps.manageInstance) {
    // full admin (builtin Admin or capability-complete custom role)
    return true;
  }
  if (caps.visibility === "view_all") {
    return page.userId != null;
  }
  return page.userId != null && page.userId === actor.userId;
}

/** Only the owner can edit an owned page. Full admins maintain ownerless legacy pages. */
export function canEditPage(
  caps: RoleCapabilities,
  actor: Actor,
  page: PageRef,
): boolean {
  if (!page) return false;
  if (page.userId === null) return caps.manageAccounts && caps.manageInstance;
  return page.userId === actor.userId;
}

/**
 * Which pages may this actor SEE in the admin UI (page switcher, dashboard)?
 *  - full admin / manage_all / view_all → every page
 *  - own → only pages they own (legacy NULL-owner rows stay admin-only)
 * Single choke point for the admin surface (layout switcher, dashboard);
 * keep it next to the predicates so visibility rules can't drift apart.
 */
export function filterVisiblePages<
  T extends { userId?: number | null },
>(pages: T[], caps: RoleCapabilities, userId: number): T[] {
  return pages.filter((page) => canViewPage(caps, { userId }, page));
}

/**
 * The page an admin screen should open. A requested id is used only when
 * this actor may see it — otherwise a member would land on the instance
 * default page (someone else's).
 */
export function pickVisiblePage<
  T extends { id: number; isDefault?: boolean; userId?: number | null },
>(
  pages: T[],
  caps: RoleCapabilities,
  userId: number,
  pageId?: number | null,
): T | undefined {
  const visible = filterVisiblePages(pages, caps, userId);
  if (pageId != null && Number.isFinite(pageId)) {
    const requested = visible.find((p) => p.id === pageId);
    if (requested) return requested;
  }
  return visible.find((p) => p.isDefault) ?? visible[0];
}
