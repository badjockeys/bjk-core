import "server-only";

import { redirect } from "next/navigation";

import type { PostComposerProps } from "@/components/PostComposer";
import { getViewer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ukDateAndTime } from "@/lib/format";
import { signInPath } from "@/lib/paths";

/**
 * What the composer needs, for both the /post/new page and the pop-up over the feed. Members need a profile to post
 * (and a confirmed email, checked by the composer). No age check: since 19 Oct 2026 it is only needed to view
 * sensitive posts.
 */
export async function composerProps(): Promise<Omit<PostComposerProps, "mode">> {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/post/new"));
  }
  if (!viewer.hasProfile) {
    redirect("/profile/new?returnTo=%2Fpost%2Fnew");
  }
  const config = getConfig();
  const now = ukDateAndTime();
  return {
    defaultDate: now.date,
    defaultTime: now.time,
    tileUrl: config.mapTileUrl,
    attribution: config.mapAttribution,
    emailVerified: viewer.emailVerified,
    author: { name: viewer.displayName ?? viewer.email ?? "You", avatarUrl: viewer.avatarUrl },
  };
}
