import type { NextRequest } from "next/server";

import { redirectToIdentityServer } from "@/lib/auth-routes";

/**
 * The age check (screen 22, on the identity server). When it's passed, the identity server continues into a new
 * sign-in, so the user comes back with a token that carries age_verified.
 */
export async function GET(request: NextRequest) {
  return redirectToIdentityServer(request, "/Account/CheckAge");
}
