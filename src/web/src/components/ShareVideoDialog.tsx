"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getShareCopy, requestShareCopy } from "@/actions/media";
import { SHARE_POLL_LIMIT_MS, SHARE_POLL_MS } from "@/lib/share-video";
import type { ShareCopyDto } from "@/lib/types";

import { DownloadIcon, SpinnerIcon } from "./icons";
import { Modal } from "./Modal";
import { toast } from "./toast";

type View =
  | { kind: "making" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

/**
 * "Download for TikTok, Reels and Shorts" on your own video post (owner, 23 Oct 2026). Asks the API for the vertical
 * copy (made by the media worker from the blurred, silent video, with a watermark and end card), waits while it's
 * made, then offers the download and a caption to paste, with the link back to the post.
 */
export function ShareVideoDialog({
  mediaId,
  caption,
  open,
  onClose,
}: {
  mediaId: string;
  caption: string;
  open: boolean;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "making" });
  const round = useRef(0);

  const show = useCallback((dto: ShareCopyDto): boolean => {
    if (dto.state === "Ready" && dto.downloadUrl) {
      setView({ kind: "ready", url: dto.downloadUrl });
      return true;
    }
    if (dto.state === "Failed") {
      setView({ kind: "error", message: "We couldn't make the video. Please try again." });
      return true;
    }
    return false;
  }, []);

  const start = useCallback(async () => {
    const mine = ++round.current;
    setView({ kind: "making" });
    const first = await requestShareCopy(mediaId);
    if (mine !== round.current) return;
    if (!first.ok) {
      setView({ kind: "error", message: first.error });
      return;
    }
    if (show(first.data)) return;

    // Being made: check every few seconds, for a few minutes at most.
    const giveUpAt = Date.now() + SHARE_POLL_LIMIT_MS;
    while (Date.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, SHARE_POLL_MS));
      if (mine !== round.current) return;
      const next = await getShareCopy(mediaId);
      if (mine !== round.current) return;
      if (!next.ok) {
        setView({ kind: "error", message: next.error });
        return;
      }
      if (show(next.data)) return;
      if (next.data.state === "None") {
        // Lost (or the video changed): ask again.
        const again = await requestShareCopy(mediaId);
        if (mine !== round.current) return;
        if (!again.ok) {
          setView({ kind: "error", message: again.error });
          return;
        }
        if (show(again.data)) return;
      }
    }
    setView({ kind: "error", message: "It's taking longer than usual. Please try again in a minute." });
  }, [mediaId, show]);

  useEffect(() => {
    if (!open) {
      round.current++; // stop checking
      return;
    }
    const timer = setTimeout(() => void start(), 0);
    return () => clearTimeout(timer);
  }, [open, start]);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast("Caption copied");
    } catch {
      toast("Couldn't copy. Select the caption and copy it instead.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share on TikTok, Reels and Shorts" titleId={`share-video-${mediaId}`}>
      {view.kind === "making" ? (
        <p className="share-making" role="status">
          <SpinnerIcon />
          Making your video. This usually takes under a minute…
        </p>
      ) : null}
      {view.kind === "error" ? (
        <div className="stack">
          <p className="error" role="alert">
            {view.message}
          </p>
          <button type="button" className="btn" onClick={() => void start()}>
            Try again
          </button>
        </div>
      ) : null}
      {view.kind === "ready" ? (
        <div className="stack">
          <p role="status">
            Your video is ready: upright for phones, with a Bad Jockeys end card. Faces and number plates are blurred
            and there&apos;s no sound.
          </p>
          <a href={view.url} className="btn btn-primary" download="bad-jockeys-clip.mp4">
            <DownloadIcon />
            Download video
          </a>
        </div>
      ) : null}
      <div className="stack share-caption">
        <label htmlFor={`share-caption-${mediaId}`} className="label">
          Caption to paste
        </label>
        <textarea id={`share-caption-${mediaId}`} readOnly rows={5} value={caption} className="textarea" />
        <button type="button" className="btn btn-sm" onClick={() => void copyCaption()}>
          Copy caption
        </button>
      </div>
    </Modal>
  );
}
