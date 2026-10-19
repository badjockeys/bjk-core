import "server-only";

import { createApiClient, endpoints, type Endpoints } from "./api-client";
import { getConfig } from "./config";

let instance: Endpoints | undefined;

/** The API client for this server, pointed at API_BASE_URL. */
export function api(): Endpoints {
  instance ??= endpoints(createApiClient(getConfig().apiBaseUrl));
  return instance;
}

export { ApiError } from "./api-client";
