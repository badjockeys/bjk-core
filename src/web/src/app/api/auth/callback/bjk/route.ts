import { NextResponse, type NextRequest } from "next/server";

import { api, ApiError } from "@/lib/api";
import { getConfig, isSecure } from "@/lib/config";
import { finishSignIn } from "@/lib/oidc";
import { safeReturnTo } from "@/lib/paths";
import { logRefusedToken } from "@/lib/refused-token";
import { transactionCookieName, unsealTransaction, writeSession } from "@/lib/session";

/** The identity server sends the browser back here with a code, which this server swaps for tokens. */
export async function GET(request: NextRequest) {
  const config = getConfig();
  const secure = isSecure(config);
  const txCookie = transactionCookieName(secure);
  const sealed = request.cookies.get(txCookie)?.value;
  const transaction = sealed ? await unsealTransaction(sealed, config.authSecret) : null;

  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/?signin=${reason}`, config.appUrl), 303);
    response.cookies.delete(txCookie);
    return response;
  };

  if (!transaction) {
    return fail("expired");
  }
  if (request.nextUrl.searchParams.has("error")) {
    // e.g. the user cancelled. Go back to where they were.
    const response = NextResponse.redirect(new URL(safeReturnTo(transaction.returnTo), config.appUrl), 303);
    response.cookies.delete(txCookie);
    return response;
  }

  // The address the identity server redirected to, as the browser saw it (not this container's own address).
  const currentUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, config.appUrl);
  let session;
  try {
    session = await finishSignIn(currentUrl, transaction);
  } catch (error) {
    console.error("Sign-in callback failed", error instanceof Error ? error.message : error);
    return fail("failed");
  }

  // People need a profile before they can post or comment, so new members go and make one first.
  let destination = safeReturnTo(transaction.returnTo);
  try {
    await api().profiles.me(session.accessToken);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      destination = `/profile/new?returnTo=${encodeURIComponent(destination)}`;
    } else if (error instanceof ApiError && error.status === 401) {
      // A token straight from the identity server, refused: the API and the identity server don't agree.
      logRefusedToken(error);
    } else {
      console.error("Couldn't check for a profile after sign-in", error instanceof Error ? error.message : error);
    }
  }

  const response = NextResponse.redirect(new URL(destination, config.appUrl), 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.delete(txCookie);
  await writeSession(request.cookies, response.cookies, session, config.authSecret, secure);
  return response;
}
