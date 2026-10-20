import "server-only";

import { redirect } from "next/navigation";

import type { ComposerData } from "@/components/PostComposer";
import { getViewer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ukDateAndTime } from "@/lib/format";
import { signInPath } from "@/lib/paths";

import type { Viewer } from "@/lib/viewer";

/**
 * The composer's data for the inline composer at the top of the feed: null for visitors and for members who haven't
 * made a profile yet (they get a link to /post/new, which sends them on).
 */
export function inlineComposerProps(viewer: Viewer): ComposerData | null {
  if (!viewer.signedIn || !viewer.hasProfile) {
    return null;
  }
  return dataFor(viewer);
}

/**
 * What the /post/new page needs. Members need a profile to post (and a confirmed email, checked by the composer). No
 * age check: since 19 Oct 2026 it is only needed to view sensitive posts.
 */
export async function composerProps(): Promise<ComposerData> {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/post/new"));
  }
  if (!viewer.hasProfile) {
    redirect("/profile/new?returnTo=%2Fpost%2Fnew");
  }
  return dataFor(viewer);
}

function dataFor(viewer: Viewer): ComposerData {
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
