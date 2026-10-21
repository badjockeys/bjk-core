"use client";

import { useState, useTransition } from "react";

import { savePost } from "@/actions/engagement";
import { followBlocker } from "@/lib/blockers";

import { BookmarkIcon } from "./icons";
import { toast } from "./toast";

/** Save a post to your bookmarks (only you see them), or remove it. */
export function SaveButton({
  postId,
  saved: initial,
  signedIn,
}: {
  postId: string;
  saved: boolean;
  signedIn: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (!signedIn) {
      followBlocker("signin");
      return;
    }
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await savePost(postId, next);
      if (!result.ok) {
        setSaved(!next);
        if (!followBlocker(result.blocker)) {
          toast(result.error);
        }
        return;
      }
      toast(next ? "Saved to your bookmarks" : "Removed from your bookmarks");
    });
  };

  return (
    <button
      type="button"
      className={`tw-act${saved ? " tw-act-on" : ""}`}
      aria-pressed={saved}
      aria-label={saved ? "Remove from bookmarks" : "Save to bookmarks"}
      disabled={pending}
      onClick={toggle}
    >
      <BookmarkIcon on={saved} />
    </button>
  );
}
