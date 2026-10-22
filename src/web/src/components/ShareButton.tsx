"use client";

import { recordShare } from "@/actions/engagement";

import { ShareIcon } from "./icons";
import { toast } from "./toast";

/** Share a post with the phone's share sheet, or copy its link. Counted for the author's reach (`postId`). */
export function ShareButton({
  path,
  title,
  postId,
  className = "tw-act",
  label,
  onShared,
}: {
  path: string;
  title: string;
  postId?: string;
  className?: string;
  /** Shown next to the icon (the post footer's "Share"); icon only when left out. */
  label?: string;
  onShared?: () => void;
}) {
  const share = async () => {
    const url = new URL(path, window.location.origin).href;
    if (postId) {
      void recordShare(postId);
      onShared?.();
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
    <button type="button" className={className} aria-label={label ? undefined : "Share"} onClick={share}>
      <ShareIcon />
      {label ? <span>{label}</span> : null}
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
