import "server-only";

import { api, ApiError } from "./api";
import { getAccessToken } from "./auth";
import type { IncidentCategory, PagedResult, PostDto } from "./types";

/** One page of the public feed as the viewer sees it, or null if the API couldn't be reached. */
export async function feedPage(
  query: { category?: IncidentCategory; author?: string },
  page: number,
): Promise<PagedResult<PostDto> | null> {
  const token = await getAccessToken();
  try {
    return await api().posts.list(token, { ...query, page });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && token) {
      return api().posts.list(null, { ...query, page });
    }
    console.error("Couldn't load the feed", error instanceof Error ? error.message : error);
    return null;
  }
}

export function pageNumber(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}
