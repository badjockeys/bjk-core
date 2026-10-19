"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { toast } from "./toast";

/**
 * Screen 06. While your post's photos or video are processing, check again every few seconds; the page shows the
 * post as soon as it's live. Also says thanks once, straight after posting.
 */
export function ProcessingWatcher({ processing, justPosted }: { processing: boolean; justPosted: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (justPosted) {
      toast("Posted. Thanks for sharing.");
      // Drop ?posted=1, so a reload doesn't say it again.
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [justPosted]);

  useEffect(() => {
    if (!processing) {
      return;
    }
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [processing, router]);

  return null;
}
