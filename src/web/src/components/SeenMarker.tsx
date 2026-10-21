"use client";

import { useEffect, useRef } from "react";

import { recordViews } from "@/actions/engagement";
import { createViewBatch, SEEN_AFTER_MS, type ViewBatch } from "@/lib/view-batch";

let batch: ViewBatch | null = null;

function viewBatch(): ViewBatch {
  if (!batch) {
    batch = createViewBatch((ids) => {
      void recordViews(ids);
    });
    window.addEventListener("pagehide", () => batch?.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        batch?.flush();
      }
    });
  }
  return batch;
}

/**
 * Counts a view of the post around it once at least half of it (or half the screen) has been on screen for a second (or straight
 * away with `immediate`, on the post's own page). Renders nothing. Views are counted once per viewer by the API and
 * only the author sees the numbers.
 */
export function SeenMarker({ postId, immediate = false }: { postId: string; immediate?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (immediate) {
      viewBatch().add(postId);
      return;
    }
    const target = ref.current?.parentElement;
    if (!target || typeof IntersectionObserver === "undefined") {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Half the post, or half the screen for posts taller than the screen.
        const seen =
          entry !== undefined &&
          entry.isIntersecting &&
          (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= window.innerHeight * 0.5);
        if (seen) {
          timer ??= setTimeout(() => {
            viewBatch().add(postId);
            observer.disconnect();
          }, SEEN_AFTER_MS);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75] },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [postId, immediate]);

  return <span ref={ref} hidden />;
}
