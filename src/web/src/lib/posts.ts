import "server-only";

import { cache } from "react";

import { api, ApiError } from "./api";
import { getAccessToken } from "./auth";
import type { PostDto } from "./types";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string): boolean {
  return GUID.test(value);
}

/** One post as the viewer may see it, or null if it doesn't exist (or isn't for them). Once per request. */
export const loadPost = cache(async (id: string): Promise<PostDto | null> => {
  if (!isGuid(id)) {
    return null;
  }
  const token = await getAccessToken();
  try {
    return await api().posts.get(token, id);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404 || error.status === 400) {
        return null;
      }
      if (error.status === 401 && token) {
        return loadPostAnonymously(id);
      }
    }
    throw error;
  }
});

async function loadPostAnonymously(id: string): Promise<PostDto | null> {
  try {
    return await api().posts.get(null, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** How many posts someone has (for "23 posts"), cached for five minutes. Null if unknown. */
export async function postCount(handle: string): Promise<number | null> {
  try {
    return (await api().posts.list(null, { author: handle, pageSize: 1 }, 300)).totalCount;
  } catch {
    return null;
  }
}
