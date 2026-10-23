"use server";

import { cookies } from "next/headers";

import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { getConfig, isSecure } from "@/lib/config";
import { clearSession } from "@/lib/session";

/**
 * Removes a session whose token the API refuses, so the browser stops sending it and the person sees "Sign in"
 * (e.g. after the local database or the identity server's signing keys were reset). Checks with the API first, so a
 * passing hiccup never signs anyone out.
 */
export async function forgetRefusedSession(): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    return;
  }
  try {
    await api().profiles.me(token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const jar = await cookies();
      clearSession(jar, jar, isSecure(getConfig()));
    }
  }
}
