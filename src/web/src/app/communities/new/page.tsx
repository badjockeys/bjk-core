import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { CommunityForm } from "@/components/communities/CommunityForm";
import { getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Start a community", robots: { index: false } };

/** Start a community (Premium, adults). The API says no to anyone else, with the reason. */
export default async function NewCommunityPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/communities/new"));
  }
  return (
    <AppShell viewer={viewer} section="communities" returnTo="/communities/new" bottomNav aside={<FooterLinks />}>
      <header className="c-head">
        <BackButton arrow />
        <h1>Start a community</h1>
      </header>
      <div className="pad stack">
        <p className="small muted">
          Communities are for Premium members to start; you&apos;ll be its admin. Anyone can join public ones; private
          ones are for adults who ask to join.
        </p>
        <CommunityForm />
      </div>
    </AppShell>
  );
}
