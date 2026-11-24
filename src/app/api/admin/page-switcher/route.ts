import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { parseAdminPageId } from "@/lib/page-path";
import { getCapabilitiesForUser } from "@/server/queries";
import { getPageSwitcherPage } from "@/server/queries/admin-pages";

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401, headers });

  const id = parseAdminPageId(request.nextUrl.searchParams.get("page"));
  if (id === null) return NextResponse.json(null, { status: 400, headers });

  const { caps } = await getCapabilitiesForUser(session.userId);
  const page = await getPageSwitcherPage(caps, session.userId, id);
  return NextResponse.json(page, { status: page ? 200 : 404, headers });
}
