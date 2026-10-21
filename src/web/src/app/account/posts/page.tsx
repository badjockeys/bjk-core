import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { VoteDurationForm } from "@/components/VoteDurationForm";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";
import type { VoteDuration } from "@/lib/types";

export const metadata: Metadata = { title: "Votes on your posts", robots: { index: false } };

/** Settings for your own posts: when the "Who's at fault?" or "How bad was it?" vote closes. */
export default async function PostSettingsPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/account/posts"));
  }
  const duration = await load();

  return (
    <AppShell viewer={viewer} section="account" returnTo="/account/posts" bottomNav>
      <header className="top">
        <div className="top-left">
          <BackButton />
          <h1 className="h2">Votes on your posts</h1>
        </div>
      </header>
      {duration ? (
        <VoteDurationForm initial={duration} />
      ) : (
        <p className="pad muted">This setting isn&apos;t available right now. Try again in a minute.</p>
      )}
    </AppShell>
  );
}

async function load(): Promise<VoteDuration | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return (await api().engagement.preferences(token)).voteDuration;
  } catch {
    return null;
  }
}
