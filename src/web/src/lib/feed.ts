import "server-only";

import { api, ApiError } from "./api";
import { getAccessToken } from "./auth";
import type { IncidentCategory, IncidentGroup, PagedResult, PostDto, TimelinesDto } from "./types";

/** One page of the public feed as the viewer sees it, or null if the API couldn't be reached. */
export async function feedPage(
  query: { category?: IncidentCategory; group?: IncidentGroup; author?: string; hashtag?: string },
  page: number,
): Promise<PagedResult<PostDto> | null> {
  const token = await getAccessToken();
  try {
    return await api().posts.list(token, { ...query, page });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && token) {
      return anonymously(() => api().posts.list(null, { ...query, page }), "the feed");
    }
    console.error("Couldn't load the feed", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The API refused the token: try again as a visitor; if that fails too, show the empty state, not an error page. */
async function anonymously<T>(call: () => Promise<T>, what: string): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    console.error(
      `Couldn't load ${what} as a visitor either`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function pageNumber(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

/** A page of a home timeline (For you, Following or a custom one), or null if the API couldn't be reached. */
export async function homePage(
  tab: { kind: "for-you" } | { kind: "following" } | { kind: "timeline"; id: string },
  page: number,
): Promise<PagedResult<PostDto> | null> {
  const token = await getAccessToken();
  try {
    if (tab.kind === "following") {
      return token ? await api().timelines.following(token, page) : null;
    }
    if (tab.kind === "timeline") {
      return token ? await api().timelines.posts(token, tab.id, page) : null;
    }
    return await api().timelines.forYou(token, page);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && token && tab.kind === "for-you") {
      return anonymously(() => api().timelines.forYou(null, page), "the timeline");
    }
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    console.error("Couldn't load the timeline", error instanceof Error ? error.message : error);
    return null;
  }
}

/** The signed-in member's custom timelines, for the home tabs (none if signed out or the API is down). */
export async function myTimelines(): Promise<TimelinesDto | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().timelines.list(token);
  } catch {
    return null;
  }
}
