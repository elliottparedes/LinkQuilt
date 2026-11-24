import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Plus, Search } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getCapabilitiesForUser } from "@/server/queries";
import { listAdminPages } from "@/server/queries/admin-pages";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function PagesDirectory({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; p?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { q, p } = await searchParams;
  const search = typeof q === "string" ? q.trim().replace(/^\//, "").slice(0, 128) : "";
  const requested = typeof p === "string" ? Number(p) : 1;
  const pageNumber = Number.isInteger(requested) && requested >= 1 && requested <= 2_147_483_647
    ? requested
    : 1;
  const { caps } = await getCapabilitiesForUser(session.userId);
  const [{ rows, hasNext }, t, common] = await Promise.all([
    listAdminPages(caps, session.userId, search, pageNumber),
    getTranslations("pageSwitcher"),
    getTranslations("common"),
  ]);
  const searchLabel = caps.manageAccounts ? t("searchPages") : t("search");

  function resultsHref(number: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (number > 1) params.set("p", String(number));
    return params.size ? `/pages?${params}` : "/pages";
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-semibold">{t("browsePages")}</h1>
        {caps.pagesLimit !== 0 && (
          <Link href="/pages/new" className={buttonVariants({ variant: "outline" })}>
            <Plus aria-hidden />
            {t("newPage")}
          </Link>
        )}
      </div>
      <form action="/pages" className="flex items-center gap-2">
        <Input
          key={search}
          type="search"
          name="q"
          defaultValue={search}
          maxLength={128}
          placeholder={searchLabel}
          aria-label={searchLabel}
        />
        <Button type="submit" variant="outline" size="icon" aria-label={t("search")}>
          <Search aria-hidden />
        </Button>
      </form>
      {rows.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((page) => (
            <li key={page.id}>
              <Link
                href={`/dashboard?page=${page.id}`}
                prefetch={false}
                className="block rounded-md px-3 py-2.5 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="block break-words text-sm font-medium">{page.title || `/${page.slug}`}</span>
                <span className="flex flex-wrap gap-x-3 break-all text-xs text-muted-foreground">
                  {page.title && <span>/{page.slug}</span>}
                  {page.owner && <span>@{page.owner}</span>}
                  {!page.isPublished && <span>{t("unpublished")}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{t("noPagesFound")}</p>
      )}
      {(pageNumber > 1 || hasNext) && (
        <div className="flex justify-between gap-2">
          {pageNumber > 1 && (
            <Link href={resultsHref(pageNumber - 1)} prefetch={false} className={buttonVariants({ variant: "outline" })}>
              {common("back")}
            </Link>
          )}
          {hasNext && (
            <Link href={resultsHref(pageNumber + 1)} prefetch={false} className={buttonVariants({ variant: "outline", className: "ms-auto" })}>
              {common("next")}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
