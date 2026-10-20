"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { unreadNotifications } from "@/actions/notifications";

import { BellIcon } from "./icons";

const CHECK_EVERY_MS = 60_000;

/**
 * The bell, with a cyan badge for unread notifications. Checks when the page loads, every minute while it's open
 * and when the tab comes back into view. `label` shows the word next to it (desktop navigation).
 */
export function NotificationBell({ label = false, className }: { label?: boolean; className?: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const here = pathname === "/notifications";

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const count = await unreadNotifications();
      if (!cancelled) setUnread(count);
    };
    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  const shown = here ? 0 : unread;
  const name = shown > 0 ? `Notifications, ${shown} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      className={className ?? "bell"}
      aria-label={name}
      aria-current={here ? "page" : undefined}
    >
      <span className="bell-icon">
        <BellIcon size={label ? 26 : 24} filled={here} />
        {shown > 0 ? (
          <span className="bell-badge" aria-hidden="true">
            {shown > 99 ? "99+" : shown}
          </span>
        ) : null}
      </span>
      {label ? "Notifications" : null}
    </Link>
  );
}
