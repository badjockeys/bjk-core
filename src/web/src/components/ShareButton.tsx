"use client";

import { recordShare } from "@/actions/engagement";

import { ShareIcon } from "./icons";
import { toast } from "./toast";

/** Share a post with the phone's share sheet, or copy its link. Counted for the author's reach (`postId`). */
export function ShareButton({ path, title, postId }: { path: string; title: string; postId?: string }) {
  const share = async () => {
    const url = new URL(path, window.location.origin).href;
    if (postId) {
      void recordShare(postId);
    }
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Cancelled, or not allowed: fall back to copying.
      }
    }
    await copyLink(url);
  };
  return (
    <button type="button" className="tw-act" aria-label="Share" onClick={share}>
      <ShareIcon />
    </button>
  );
}

export async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
  } catch {
    toast(url);
  }
}
