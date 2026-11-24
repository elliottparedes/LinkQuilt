import { redirect } from "next/navigation";
import {
  getAllThemes,
  getActiveTheme,
  getThemeById,
  getThemeLibrary,
  getThemeIdsUsedByOtherPages,
  getAllCustomFonts,
  getCapabilitiesForUser,
} from "@/server/queries";
import { getSession } from "@/lib/auth";
import { canEditPage } from "@/lib/ownership";
import { getAdminPage } from "@/server/queries/admin-pages";
import type { CustomFontMeta } from "@/lib/custom-fonts";
import { canEditThemeInPlace } from "@/lib/theme-editing";
import { ThemeManager } from "./theme-manager";

export const dynamic = "force-dynamic";

export default async function ThemePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  // getActiveTheme backfills missing presets before we read the library.
  const [{ caps }, active] = await Promise.all([
    getCapabilitiesForUser(session.userId),
    getActiveTheme(),
  ]);

  const { page: pageParam } = await searchParams;
  const activePage = await getAdminPage(caps, session.userId, pageParam);

  const [themes, pageTheme, fontRows] = await Promise.all([
    caps.manageInstance ? getAllThemes() : getThemeLibrary(session.userId),
    activePage?.themeId ? getThemeById(activePage.themeId) : null,
    getAllCustomFonts(),
  ]);

  // Uploaded fonts (#82) — serialisable metadata for the client customizer.
  const customFonts: CustomFontMeta[] = fontRows.map((f) => ({
    id: f.id,
    name: f.name,
    family: f.family,
    filename: f.filename,
    url: f.url,
    sizeBytes: f.sizeBytes,
    format: f.format,
  }));

  const effective = pageTheme ?? active;
  const candidateThemeIds = (effective ? [...themes, effective] : themes)
    .filter((theme) => canEditThemeInPlace(theme, {
      ownerId: activePage?.userId ?? session.userId,
      pageId: activePage?.id,
      manageInstance: caps.manageInstance,
      usedByOtherPage: false,
    }))
    .map((theme) => theme.id);
  const otherThemeIds = await getThemeIdsUsedByOtherPages(candidateThemeIds, activePage?.id);
  const editableThemeIds = candidateThemeIds.filter((id) => !otherThemeIds.has(id));

  return (
    <div className="flex flex-col gap-8">
      <ThemeManager
        key={`${session.userId}:${activePage?.id ?? "default"}`}
        userId={session.userId}
        themes={themes}
        active={effective}
        pageId={activePage?.id}
        canApply={activePage ? canEditPage(caps, session, activePage) : caps.manageInstance}
        manageInstance={caps.manageInstance}
        editableThemeIds={editableThemeIds}
        customFonts={customFonts}
        pageBgAdjustment={{
          fit: activePage?.backgroundFitOverride ?? null,
          posX: activePage?.backgroundPosX ?? null,
          posY: activePage?.backgroundPosY ?? null,
          zoom: activePage?.backgroundZoom ?? null,
        }}
      />
    </div>
  );
}
