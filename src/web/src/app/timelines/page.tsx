import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { TimelineEditor } from "@/components/TimelineEditor";
import { getViewer } from "@/lib/auth";
import { myTimelines } from "@/lib/feed";
import { signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Your timelines", robots: { index: false } };

/** Add, change, reorder and delete your custom timelines (UI step 6). */
export default async function TimelinesPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/timelines"));
  }
  const timelines = await myTimelines();

  return (
    <AppShell viewer={viewer} section="home" returnTo="/timelines" bottomNav aside={<FooterLinks />}>
      <header className="c-head">
        <BackButton arrow />
        <h1>Your timelines</h1>
      </header>
      {timelines ? (
        <TimelineEditor initial={timelines} />
      ) : (
        <p className="pad muted">Timelines aren&apos;t available right now. Please try again in a moment.</p>
      )}
    </AppShell>
  );
}
