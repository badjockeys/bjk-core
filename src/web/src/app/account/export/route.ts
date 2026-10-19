import { NextResponse } from "next/server";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getConfig } from "@/lib/config";

/**
 * "Download your data": one JSON file with what the identity server holds (account) and what core holds (profile,
 * posts, comments, reactions, reports, and 24-hour download links for original uploads).
 */
export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.redirect(new URL("/auth/sign-in?returnTo=%2Faccount", getConfig().appUrl), 303);
  }

  const [content, account] = await Promise.all([
    api()
      .me.dataExport(token)
      .catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Unavailable" })),
    fetch(`${getConfig().authority}/api/me/data-export`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : { error: `The account service returned ${r.status}.` }))
      .catch(() => ({ error: "The account service couldn't be reached." })),
  ]);

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify({ exportedAt, account, content }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="bad-jockeys-data-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
