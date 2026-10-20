import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FeedPage } from "@/components/FeedPage";
import { getViewer } from "@/lib/auth";
import { pageNumber } from "@/lib/feed";
import { signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Following", robots: { index: false } };

/** The Following timeline: posts by people you follow, and your own, newest first. */
export default async function FollowingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/following"));
  }
  return (
    <FeedPage
      viewer={viewer}
      home={{ kind: "following" }}
      label={null}
      basePath="/following"
      page={pageNumber((await searchParams).page)}
    />
  );
}
