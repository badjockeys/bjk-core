import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { NotificationSettingsForm } from "@/components/NotificationSettingsForm";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";
import type { NotificationSettingDto } from "@/lib/types";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

/** What goes in the bell and what's also emailed, per type. */
export default async function NotificationSettingsPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/account/notifications"));
  }
  const settings = await load();

  return (
    <AppShell viewer={viewer} section="account" returnTo="/account/notifications" bottomNav>
      <header className="top">
        <div className="top-left">
          <BackButton />
          <h1 className="h2">Notifications</h1>
        </div>
      </header>
      {settings ? (
        <NotificationSettingsForm settings={settings} email={viewer.emailVerified ? viewer.email : null} />
      ) : (
        <p className="pad muted">Settings aren&apos;t available right now. Try again in a minute.</p>
      )}
    </AppShell>
  );
}

async function load(): Promise<NotificationSettingDto[] | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().notifications.settings(token);
  } catch {
    return null;
  }
}
