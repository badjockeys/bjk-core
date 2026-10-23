import "server-only";

import { cache } from "react";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { CommunityDto } from "@/lib/types";

/** One community for the signed-in viewer, or null if it doesn't exist (or the API can't be reached). */
export const loadCommunity = cache(async (slug: string): Promise<CommunityDto | null> => {
  if (!/^[a-z0-9-]{1,70}$/.test(slug)) {
    return null;
  }
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().communities.get(token, slug);
  } catch {
    return null;
  }
});
