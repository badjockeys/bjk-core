import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { AreaAlertsForm } from "@/components/AreaAlertsForm";
import { BackButton } from "@/components/BackButton";
import { NotificationSettingsForm } from "@/components/NotificationSettingsForm";
import { PushToggle } from "@/components/PushToggle";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";
import type { AreaSettingsDto, NotificationSettingDto } from "@/lib/types";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

/** Push on this device, then what goes in the bell, what's emailed and what's pushed, per type. */
export default async function NotificationSettingsPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/account/notifications"));
  }
  const [settings, area] = await Promise.all([load(), loadArea()]);

  return (
    <AppShell viewer={viewer} section="account" returnTo="/account/notifications" bottomNav>
      <header className="top">
        <div className="top-left">
          <BackButton />
          <h1 className="h2">Notifications</h1>
        </div>
      </header>
      <PushToggle />
      {settings ? (
        <NotificationSettingsForm settings={settings} email={viewer.emailVerified ? viewer.email : null} />
      ) : (
        <p className="pad muted">Settings aren&apos;t available right now. Try again in a minute.</p>
      )}
      {area ? <AreaAlertsForm initial={area} /> : null}
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

async function loadArea(): Promise<AreaSettingsDto | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().notifications.area(token);
  } catch {
    return null;
  }
}
