"use client";

import { useRouter } from "next/navigation";

import { ArrowBackIcon, BackIcon } from "./icons";

/** Back to where the reader came from, or to the feed if they arrived from elsewhere. */
export function BackButton({ fallback = "/", arrow = false }: { fallback?: string; arrow?: boolean }) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      className="icon-btn"
      aria-label="Back"
      onClick={(event) => {
        if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
          event.preventDefault();
          router.back();
        }
      }}
    >
      {arrow ? <ArrowBackIcon /> : <BackIcon />}
    </a>
  );
}
