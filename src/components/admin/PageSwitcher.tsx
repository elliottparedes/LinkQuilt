"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Plus, FileText, Search, Star, Globe, Trash2 } from "lucide-react";
import type { PageSwitcherPage } from "@/server/queries/admin-pages";
import { updatePageAction } from "@/server/actions/pages";
import { DeletePageDialog } from "@/components/admin/delete-page-dialog";
import { usePreview } from "@/components/admin/PreviewPane";
import { SuccessToast } from "@/components/ui/success-toast";

interface PageSwitcherProps {
  pages: PageSwitcherPage[];
  variant?: "full" | "compact";
}

export function PageSwitcher({
  pages,
  variant = "full",
  canManageInstance = false,
}: PageSwitcherProps & { canManageInstance?: boolean }) {
  const t = useTranslations("pageSwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { activePage } = usePreview();
  const [open, setOpen] = React.useState(false);
  const [pageToDelete, setPageToDelete] = React.useState<PageSwitcherProps["pages"][number] | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [defaultError, setDefaultError] = React.useState<string | null>(null);
  const [settingDefaultId, startDefaultTransition] = React.useTransition();
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const shortcuts = activePage && !pages.some((page) => page.id === activePage.id)
    ? [...pages, activePage]
    : pages;

  // Close dropdown on outside click.
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function navigateToPage(pageId: number) {
    if (pathname === "/pages" || pathname === "/pages/new") {
      router.push(`/dashboard?page=${pageId}`);
      setOpen(false);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(pageId));
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function setDefault(page: PageSwitcherProps["pages"][number]) {
    const formData = new FormData();
    formData.set("pageId", String(page.id));
    formData.set("isDefault", "true");
    startDefaultTransition(async () => {
      const result = await updatePageAction(formData);
      if (!result.success) {
        setDefaultError(result.error);
        return;
      }
      setDefaultError(null);
      setToast(t("nowDefault", { name: page.title || page.slug }));
      // Follow the page to its new home at the top of the list.
      navigateToPage(page.id);
      router.refresh();
    });
  }

  const isCompact = variant === "compact";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={
          isCompact
            ? "flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/50"
            : "flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50"
        }
      >
        <span className="flex items-center gap-2 truncate">
          {activePage?.isDefault ? (
            <Star className="size-3.5 shrink-0 text-warning" fill="currentColor" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="max-w-[100px] truncate font-medium">
            {activePage ? activePage.title || activePage.slug : t("browsePages")}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={
            isCompact
              ? "absolute right-0 top-full z-50 mt-1 max-h-[60dvh] w-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
              : "absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[60dvh] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          }
        >
          {shortcuts.map((page) => (
            <div
              key={page.id}
              className={`flex w-full items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 ${
                page.id === activePage?.id ? "bg-muted/30" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => navigateToPage(page.id)}
                className="flex flex-1 items-center gap-2 truncate text-left"
              >
                {page.isDefault ? (
                  <Star className="size-3.5 shrink-0 text-warning" fill="currentColor" />
                ) : (
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">
                  {page.title || page.slug}
                </span>
                {!page.isPublished && (
                  <Globe className="size-3 shrink-0 text-muted-foreground opacity-50" />
                )}
              </button>
              {page.canEdit && !page.isDefault && (
                <>
                  {canManageInstance ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDefault(page);
                      }}
                      disabled={settingDefaultId}
                      className="mr-1 shrink-0 text-muted-foreground transition-colors hover:text-warning disabled:opacity-50"
                      aria-label={t("makeDefault", { name: page.title || page.slug })}
                      title={t("makeDefault", { name: page.title || page.slug })}
                    >
                      <Star className="size-3.5" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPageToDelete(page);
                    }}
                    className="mr-1 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={t("deletePage", { name: page.title || page.slug })}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
              <a
                href={`/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground transition-colors hover:text-lavender"
                aria-label={t("viewPage", { slug: page.slug })}
              >
                /{page.slug}
              </a>
            </div>
          ))}
          {defaultError ? (
            <p className="px-2 py-1.5 text-xs text-destructive" role="alert">
              {defaultError}
            </p>
          ) : null}
          <div className="mt-1 border-t border-border pt-1">
            <Link
              href="/pages"
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Search className="size-3.5" />
              {t("browsePages")}
            </Link>
            <Link
              href="/pages/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Plus className="size-3.5" />
              {t("newPage")}
            </Link>
          </div>
        </div>
      )}

      <DeletePageDialog
        page={pageToDelete}
        open={pageToDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPageToDelete(null);
        }}
      />

      {toast ? <SuccessToast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
