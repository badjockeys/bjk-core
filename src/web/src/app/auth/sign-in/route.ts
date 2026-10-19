import type { NextRequest } from "next/server";

import { redirectToIdentityServer } from "@/lib/auth-routes";

/** Sign in (screen 16 is the identity server's page). ?returnTo=/path brings the user back afterwards. */
export async function GET(request: NextRequest) {
  return redirectToIdentityServer(request);
}
