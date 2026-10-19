import { NextResponse, type NextRequest } from "next/server";

import { isSameOrigin } from "@/lib/auth-routes";
import { getConfig, isSecure } from "@/lib/config";
import { revokeRefreshToken, signOutUrl } from "@/lib/oidc";
import { clearSession, readSession } from "@/lib/session";

/** Sign out here and at the identity server. A form post from our own pages only. */
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isSameOrigin(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const secure = isSecure(config);
  const session = await readSession(request.cookies, config.authSecret, secure);
  await revokeRefreshToken(session);

  let target: URL;
  try {
    target = await signOutUrl(session);
  } catch {
    target = new URL("/", config.appUrl);
  }
  const response = NextResponse.redirect(target, 303);
  clearSession(request.cookies, response.cookies, secure);
  return response;
}
