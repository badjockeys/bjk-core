import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getConfig, isSecure } from "./config";
import { identityPageThenAuthorize, startSignIn } from "./oidc";
import { safeReturnTo } from "./paths";
import {
  cookieOptions,
  sealTransaction,
  TRANSACTION_LIFETIME_SECONDS,
  transactionCookieName,
} from "./session";

/**
 * Starts a sign-in and redirects the browser: straight to the identity server's authorize endpoint, or first to one
 * of its pages (sign up, age check) that then continues into the authorize request.
 */
export async function redirectToIdentityServer(request: NextRequest, page?: string): Promise<NextResponse> {
  const config = getConfig();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const { url, transaction } = await startSignIn(returnTo);
  const target = page ? identityPageThenAuthorize(page, url) : url;

  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(
    transactionCookieName(isSecure(config)),
    await sealTransaction(transaction, config.authSecret),
    cookieOptions(isSecure(config), TRANSACTION_LIFETIME_SECONDS),
  );
  return response;
}

/** True if a form post came from our own pages (CSRF protection for route handlers; server actions check this too). */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === getConfig().appUrl.origin;
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}
