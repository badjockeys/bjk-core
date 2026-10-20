"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { HashtagSuggestionDto } from "@/lib/types";

import { run } from "./run";

/** Tags starting with what's been typed after the #, for the composer's suggestions. */
export async function suggestHashtags(prefix: string): Promise<ActionResult<HashtagSuggestionDto[]>> {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,49}$/.test(prefix)) {
    return { ok: true, data: [] };
  }
  return run(() => api().hashtags.suggest(prefix));
}
