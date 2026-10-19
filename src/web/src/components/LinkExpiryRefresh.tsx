"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { refreshDelay } from "@/lib/links";

/**
 * Sensitive media for age-verified members come as signed links that work for about 10 minutes (`linksExpireAt`).
 * This re-renders the page from the server shortly before the earliest one expires, so the links are always fresh.
 */
export function LinkExpiryRefresh({ expiresAt }: { expiresAt: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const delay = refreshDelay(expiresAt);
    if (delay === null) {
      return;
    }
    const timer = setTimeout(() => router.refresh(), Math.max(delay, 1_000));
    return () => clearTimeout(timer);
  }, [expiresAt, router]);
  return null;
}
