import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { NotificationList } from "@/components/NotificationList";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";
import type { NotificationDto, PagedResult } from "@/lib/types";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

/** The bell: passenger tags, comments, replies and reactions, newest first. Opening it marks them read. */
export default async function NotificationsPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/notifications"));
  }
  const first = await firstPage();

  return (
    <AppShell
      viewer={viewer}
      section="notifications"
      returnTo="/notifications"
      bottomNav
      aside={<FooterLinks />}
    >
      <header className="top">
        <div className="top-left">
          <span className="m-only">
            <BackButton />
          </span>
          <h1 className="h2">Notifications</h1>
        </div>
        <Link href="/account/notifications" className="link small">
          Settings
        </Link>
      </header>
      {first ? (
        <NotificationList first={first} />
      ) : (
        <p className="pad muted">Notifications aren&apos;t available right now. Try again in a minute.</p>
      )}
    </AppShell>
  );
}

async function firstPage(): Promise<PagedResult<NotificationDto> | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    const first = await api().notifications.list(token, 1);
    // Opening the page marks them read (they stay tinted on this visit, so you can see what was new).
    if (first.items.some((n) => !n.isRead)) {
      await api().notifications.markRead(token, null);
    }
    return first;
  } catch {
    return null;
  }
}
