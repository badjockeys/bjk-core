import "server-only";

import { ApiError } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { getAccessToken } from "@/lib/auth";
import { logRefusedToken } from "@/lib/refused-token";

export const SIGN_IN_FIRST: ActionResult<never> = {
  ok: false,
  error: "Please sign in first.",
  blocker: "signin",
};

/** Shown when the API refuses a token the user does have: sending them to sign in again would just loop. */
export const TOKEN_REFUSED: ActionResult<never> = {
  ok: false,
  error: "The server didn't accept your sign-in. Sign out and back in; if it keeps happening, the API's log says why.",
};

/** Run an API call as the signed-in user, turning API errors into messages the page can show. */
export async function asUser<T>(call: (token: string) => Promise<T>): Promise<ActionResult<T>> {
  const token = await getAccessToken();
  if (!token) {
    return SIGN_IN_FIRST;
  }
  try {
    return { ok: true, data: await call(token) };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // We have a current token and the API still says 401, so signing in again won't help (the identity server
      // would hand back the same kind of token and send them straight back here, which looks like a refresh).
      logRefusedToken(error);
      return TOKEN_REFUSED;
    }
    return failure(error);
  }
}

export async function run<T>(call: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await call() };
  } catch (error) {
    return failure(error);
  }
}

export function failure(error: unknown): ActionResult<never> {
  if (error instanceof ApiError) {
    if (error.isAgeCheckNeeded) {
      return { ok: false, error: error.userMessage, blocker: "age" };
    }
    if (error.status === 401) {
      return SIGN_IN_FIRST;
    }
    if (error.status === 400 && error.fieldErrors.profile) {
      return { ok: false, error: error.userMessage, blocker: "profile", fieldErrors: error.fieldErrors };
    }
    return { ok: false, error: error.userMessage, fieldErrors: error.fieldErrors };
  }
  console.error("Server action failed", error instanceof Error ? error.message : error);
  return { ok: false, error: "Something went wrong. Please try again." };
}
