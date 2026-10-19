import type { NextRequest } from "next/server";

import { redirectToIdentityServer } from "@/lib/auth-routes";

/**
 * Join (screens 17, 18, 22 and 25 are the identity server's: sign up, check your email, age check, UK only). After
 * signing up the identity server signs the user in and carries on to the age check, then back here.
 */
export async function GET(request: NextRequest) {
  return redirectToIdentityServer(request, "/Account/Register");
}
