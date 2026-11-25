import { redirect } from "next/navigation";
import { getOidcIdentitiesForUser, getCapabilitiesForUser, type SocialLink } from "@/server/queries";
import { canEditPage } from "@/lib/ownership";
import { getSession } from "@/lib/auth";
import { getAdminPage } from "@/server/queries/admin-pages";
import { oidcAccountLinkingSupported } from "@/server/actions/oidc";
import { ProfileForm } from "./profile-form";
import { SsoIdentitiesCard } from "./sso-identities-card";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const { caps } = await getCapabilitiesForUser(session.userId);
  const activePage = await getAdminPage(caps, session.userId, pageParam);
  if (activePage && !canEditPage(caps, session, activePage)) redirect(`/dashboard?page=${activePage.id}`);

  let socialLinks: SocialLink[] = [];
  try {
    socialLinks = JSON.parse(activePage?.socialLinks || "[]");
  } catch {
    socialLinks = [];
  }

  const [identities, linkingSupported] = session
    ? await Promise.all([
        getOidcIdentitiesForUser(session.userId),
        oidcAccountLinkingSupported(),
      ])
    : [[], false];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <ProfileForm
      pageId={activePage?.id}
      profile={
        activePage
          ? {
              displayName: activePage.title,
              bio: activePage.bio,
              badgeText: activePage.badgeText ?? "",
              avatarUrl: activePage.avatarUrl ?? "",
              bannerUrl: activePage.bannerUrl ?? "",
              socialLinks,
              avatarFit: activePage.avatarFit,
              avatarPosX: activePage.avatarPosX,
              avatarPosY: activePage.avatarPosY,
              avatarZoom: activePage.avatarZoom,
              bannerFit: activePage.bannerFit,
              bannerPosX: activePage.bannerPosX,
              bannerPosY: activePage.bannerPosY,
              bannerZoom: activePage.bannerZoom,
            }
          : null
      }
      />
      <SsoIdentitiesCard identities={identities} linkingSupported={linkingSupported} />
    </div>
  );
}
