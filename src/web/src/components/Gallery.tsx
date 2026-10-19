"use client";

import { useEffect, useRef, useState } from "react";

import type { PostMediaDto } from "@/lib/types";

import { BackIcon, ChevronIcon, CloseIcon } from "./icons";

/**
 * A post's photos. Phones: swipe through them full width, with "1 / 3" and dots. Desktop: a grid; any photo opens a
 * full-screen viewer with previous / next (arrow keys work too).
 */
export function Gallery({ photos, title }: { photos: PostMediaDto[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const count = photos.length;

  useEffect(() => {
    const el = strip.current;
    if (!el) {
      return;
    }
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) {
      return;
    }
    if (viewing !== null && !d.open) {
      d.showModal();
    } else if (viewing === null && d.open) {
      d.close();
    }
  }, [viewing]);

  const step = (delta: number) => setViewing((v) => (v === null ? v : (v + delta + count) % count));
  const shown = photos.slice(0, 4);
  const extra = count - shown.length;
  const current = viewing !== null ? photos[viewing] : undefined;

  return (
    <>
      <div className="gallery-wrap stack" style={{ gap: 8 }}>
        <div
          ref={strip}
          className="gallery"
          role="group"
          aria-roledescription="carousel"
          aria-label={`${title}: photos`}
        >
          {photos.map((photo, i) => (
            <div
              key={photo.mediaId}
              className="gallery-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`Photo ${i + 1} of ${count}`}
            >
              <img
                src={photo.playbackUrl}
                alt={`Photo ${i + 1} of ${count}`}
                loading={i === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
        {count > 1 ? (
          <>
            <span className="badge badge-tr" aria-hidden="true">
              {index + 1} / {count}
            </span>
            <div className="dots" aria-hidden="true">
              {photos.map((p, i) => (
                <span key={p.mediaId} data-on={i === index} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className={`gallery-grid n${Math.min(count, 4)}`} aria-label={`${count} photos`}>
        {shown.map((photo, i) => (
          <button
            key={photo.mediaId}
            type="button"
            onClick={() => setViewing(i)}
            aria-label={`View photo ${i + 1} of ${count}`}
          >
            <img src={count === 1 ? photo.playbackUrl : (photo.thumbnailUrl ?? photo.playbackUrl)} alt="" />
            {i === shown.length - 1 && extra > 0 ? <span className="more">+{extra}</span> : null}
          </button>
        ))}
      </div>

      <dialog
        ref={dialog}
        className="lightbox"
        aria-label={`Photo ${(viewing ?? 0) + 1} of ${count}`}
        onClose={() => setViewing(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        <div className="lightbox-inner">
          {current ? <img src={current.playbackUrl} alt={`Photo ${(viewing ?? 0) + 1} of ${count}`} /> : null}
          <button
            type="button"
            className="icon-btn"
            style={{ top: 16, right: 16 }}
            aria-label="Close"
            onClick={() => setViewing(null)}
          >
            <CloseIcon />
          </button>
          {count > 1 ? (
            <>
              <button
                type="button"
                className="icon-btn"
                style={{ left: 16, top: "50%" }}
                aria-label="Previous photo"
                onClick={() => step(-1)}
              >
                <BackIcon />
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ right: 16, top: "50%" }}
                aria-label="Next photo"
                onClick={() => step(1)}
              >
                <ChevronIcon />
              </button>
            </>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
