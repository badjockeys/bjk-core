import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { NewPostWizard } from "@/components/NewPostWizard";
import { getViewer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ukDateAndTime } from "@/lib/format";
import { signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "New post", robots: { index: false } };

/**
 * Screens 08, 24 and 09. Members need a profile to post (and a confirmed email, checked by the wizard). No age check:
 * since 19 Oct 2026 it is only needed to view sensitive posts.
 */
export default async function NewPostPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/post/new"));
  }
  if (!viewer.hasProfile) {
    redirect("/profile/new?returnTo=%2Fpost%2Fnew");
  }
  const config = getConfig();
  const now = ukDateAndTime();
  return (
    <NewPostWizard
      defaultDate={now.date}
      defaultTime={now.time}
      tileUrl={config.mapTileUrl}
      attribution={config.mapAttribution}
      emailVerified={viewer.emailVerified}
    />
  );
}
