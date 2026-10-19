import "server-only";

import type { ApiError } from "./api";

/** The API refused our access token: say so in the web server's log, with the API's reason when it gives one. */
export function logRefusedToken(error: ApiError): void {
  console.error(
    `The API refused the signed-in user's access token (401 on ${error.path})` +
      (error.authenticate ? `: ${error.authenticate}` : "") +
      ". Check the API's log, and that its Authentication:Authority matches the identity server the web app signs in with.",
  );
}
