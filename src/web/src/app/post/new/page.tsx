import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NewPostWizard } from "@/components/NewPostWizard";
import { LogoMark } from "@/components/icons";
import { getViewer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { ukDateAndTime } from "@/lib/format";
import { checkAgePath, signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "New post", robots: { index: false } };

/** Screens 08, 24 and 09. Members need a profile and a passed age check to post. */
export default async function NewPostPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/post/new"));
  }
  if (!viewer.hasProfile) {
    redirect("/profile/new?returnTo=%2Fpost%2Fnew");
  }
  if (!viewer.ageVerified) {
    return (
      <main id="main" className="auth-card">
        <LogoMark size={40} />
        <h1 className="h1">Check your age to post</h1>
        <p>
          Bad Jockeys is for adults aged 18 and over. Before you post, please do a quick age check: a short
          selfie video, deleted straight away.
        </p>
        <a href={checkAgePath("/post/new")} className="btn btn-primary btn-block">
          Check my age
        </a>
        <Link href="/" className="btn btn-block">
          Not now
        </Link>
      </main>
    );
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
