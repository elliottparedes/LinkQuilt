import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getSession } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { isDemoMode } from "@/lib/demo";
import { getAllPages, getCapabilitiesForUser } from "@/server/queries";
import { AuroraBackground } from "@/components/aurora/AuroraBackground";
import { MobileTabBar } from "@/components/admin/MobileTabBar";
import { MobileHeaderActions } from "@/components/admin/MobileHeaderActions";
import { PageSwitcher } from "@/components/admin/PageSwitcher";
import { filterVisiblePages, showPageSwitcher } from "@/lib/ownership";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { PreviewProvider } from "@/components/admin/PreviewPane";
import { getLocale } from "@/i18n/server";
import { LOCALE_HTML_LANG, localeDir } from "@/i18n/config";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/** Translated tab title for every admin page (root metadata stays English/SEO). */
export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("adminTitle") };
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = await getTranslations("shell");
  const dir = localeDir(locale);
  const htmlLang = LOCALE_HTML_LANG[locale];

  // i18n provider wraps the whole admin shell (both branches) so the
  // login/setup screens are translated too. messages are resolved from
  // the request config; NextIntlClientProvider inherits them server-side
  // and serializes the needed namespaces to the client automatically.
  const shell = (inner: React.ReactNode) => (
    <NextIntlClientProvider>
      <div
        lang={htmlLang}
        dir={dir}
        className="min-h-dvh w-full dark"
      >
        <AuroraBackground />
        {inner}
      </div>
    </NextIntlClientProvider>
  );

  // Route protection is handled by middleware. Here we only decide whether to
  // render the admin chrome (authed) or a bare shell (login / setup).
  if (!session) {
    return shell(children);
  }

  // Load pages for the page switcher (only when authed). #124: the switcher
  // and dashboard are scoped to the pages the user's role may SEE — a plain
  // member never sees (or can pick) anyone else's page here.
  const [capsForUser, allPages] = await Promise.all([
    getCapabilitiesForUser(session.userId),
    getAllPages(),
  ]);
  const visiblePages = filterVisiblePages(allPages, capsForUser.caps, session.userId);
  const homeSlug = capsForUser.pageNamespace ?? session.username.toLowerCase();
  const homePage = visiblePages.find((page) =>
    page.isPublished && page.slug.toLowerCase() === homeSlug &&
    (page.userId === session.userId ||
      (page.userId === null && page.isDefault && capsForUser.roleText === "admin")),
  ) ?? visiblePages.find((page) =>
    page.isPublished && page.userId === session.userId && !page.slug.includes("/"),
  );
  const publicPageHref = homePage ? `/${homePage.slug}` : isDemoMode ? "/" : null;
  const brandLabel = publicPageHref ? t("visitSite") : (await getTranslations("nav"))("dashboard");
  const showPages = showPageSwitcher(capsForUser.caps);
  const pageList = visiblePages.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    isDefault: p.isDefault,
    isPublished: p.isPublished,
  }));

  return (
    <NextIntlClientProvider>
    <PreviewProvider pages={pageList}>
      <React.Suspense fallback={null}>
      <div
        lang={htmlLang}
        dir={dir}
        className="dark relative min-h-dvh bg-background text-foreground"
      >
        <AuroraBackground />
        {/* Full-bleed row: sidebar anchors to the left edge instead of floating
            in a centered box, so the layout stays grounded at every resolution. */}
        <div className="flex w-full">
          {/* Sidebar — pinned left, full viewport height, sticky while scrolling.
              Collapses to the icon rail via AdminSidebar (client). */}
          <React.Suspense fallback={null}>
            <AdminSidebar
              username={session.username}
              publicPageHref={publicPageHref}
              brandLabel={brandLabel}
              pages={pageList}
              canManageAccounts={capsForUser.caps.manageAccounts}
              canManageInstance={capsForUser.caps.manageInstance}
              showPages={showPages}
            />
          </React.Suspense>

          {/* Main column */}
          <div className="flex min-h-dvh flex-1 flex-col min-w-0">
            {/* Mobile top bar */}
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 md:hidden">
              <div className="flex items-center gap-2">
                <Link
                  href={publicPageHref ?? "/dashboard"}
                  prefetch={false}
                  target={publicPageHref ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  title={brandLabel}
                  aria-label={brandLabel}
                  className="flex items-center gap-2 rounded-md transition-opacity hover:opacity-80"
                >
                  <Image src="/logo-mark.svg" alt="" width={24} height={24} unoptimized />
                  <span className="font-heading font-semibold">{PRODUCT_NAME}</span>
                </Link>
              </div>
              <div className="flex items-center gap-2">
                {showPages ? (
                  <React.Suspense fallback={null}>
                    <PageSwitcher pages={pageList} variant="compact" canManageInstance={capsForUser.caps.manageInstance} />
                  </React.Suspense>
                ) : null}
                <React.Suspense fallback={null}>
                  <MobileHeaderActions
                    canManageAccounts={capsForUser.caps.manageAccounts}
                    canManageInstance={capsForUser.caps.manageInstance}
                  />
                </React.Suspense>
              </div>
            </header>

            {/* pb-32 reserves space for the fixed mobile dock (its raised
                center Preview button adds ~28px above the bar) so content is
                never hidden behind it; md:pb-8 restores desktop padding. */}
            <main className="flex-1 p-4 pb-32 md:p-6 md:pb-6">
              <div className="w-full">
                {isDemoMode && (
                  <div className="mb-4 shrink-0 rounded-lg border border-violet/30 bg-violet/10 px-4 py-3 text-sm text-lavender">
                    <strong>{t("demoBannerLead")}</strong>{" "}
                    <Link href="/" prefetch={false} className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
                      {t("demoBannerVisit")}
                    </Link>
                    {" · "}
                    <a href="https://github.com/elliottparedes/LinkBreeze" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">
                      {t("demoBannerDeploy")}
                    </a>
                  </div>
                )}
                {children}
              </div>
            </main>
            <React.Suspense fallback={null}>
              <MobileTabBar />
            </React.Suspense>
          </div>
        </div>
      </div>
      </React.Suspense>
      </PreviewProvider>
    </NextIntlClientProvider>
  );
}
