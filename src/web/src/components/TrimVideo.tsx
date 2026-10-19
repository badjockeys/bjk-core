"use client";

import { useMemo, useRef, useState } from "react";

import { duration as formatDuration } from "@/lib/format";
import {
  initialSelection,
  isWholeVideo,
  MAX_CLIP_SECONDS,
  moveEdge,
  targetSize,
  type Selection,
} from "@/lib/trim";

import { BackIcon, ShieldIcon } from "./icons";

export interface TrimmedClip {
  blob: Blob;
  fileName: string;
  contentType: string;
  /** The clip's length if known (to warn before the server's 30-second limit rejects it). */
  seconds: number;
  /** False when the browser couldn't convert it and it's being uploaded as it was chosen. */
  converted: boolean;
}

/** Screen 24: choose up to 30 seconds of a longer video. The clip is shrunk to 720p here before upload. */
export function TrimVideo({
  file,
  contentType,
  onBack: leave,
  onDone: finish,
}: {
  file: File;
  contentType: string;
  onBack: () => void;
  onDone: (clip: TrimmedClip) => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const video = useRef<HTMLVideoElement>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The preview's object URL is released when the person leaves this screen.
  const onBack = () => {
    URL.revokeObjectURL(url);
    leave();
  };
  const onDone = (clip: TrimmedClip) => {
    URL.revokeObjectURL(url);
    finish(clip);
  };

  const length = meta?.duration ?? 0;
  const selected = selection.end - selection.start;

  const move = (edge: "start" | "end", value: number) => {
    const next = moveEdge(selection, edge, value, length);
    setSelection(next);
    if (video.current) {
      video.current.currentTime = edge === "start" ? next.start : next.end;
    }
  };

  const confirmClip = async () => {
    if (!meta) {
      return;
    }
    setError(null);
    const asIs: TrimmedClip = {
      blob: file,
      fileName: file.name,
      contentType,
      seconds: meta.duration,
      converted: false,
    };
    const needsWork = !isWholeVideo(selection, meta.duration) || targetSize(meta.width, meta.height) !== null;
    if (!needsWork) {
      onDone(asIs);
      return;
    }
    // Loaded only now: the converter isn't part of any other page.
    const { canTrimInBrowser, trimAndShrink } = await import("@/lib/video-trim");
    if (!canTrimInBrowser()) {
      onDone(asIs);
      return;
    }
    try {
      setProgress(0);
      const blob = await trimAndShrink(file, selection, meta, (p) => setProgress(p));
      onDone({
        blob,
        fileName: file.name.replace(/\.[^.]+$/, "") + "-clip.mp4",
        contentType: "video/mp4",
        seconds: selected,
        converted: true,
      });
    } catch {
      setProgress(null);
      setError(
        meta.duration > MAX_CLIP_SECONDS + 0.5
          ? "Your browser couldn't trim this video. Trim it to 30 seconds on your phone, or try another browser."
          : "Your browser couldn't shrink this video, so we'll upload it as it is.",
      );
      if (meta.duration <= MAX_CLIP_SECONDS + 0.5) {
        onDone(asIs);
      }
    }
  };

  const left = length ? (selection.start / length) * 100 : 0;
  const width = length ? (selected / length) * 100 : 100;

  return (
    <div className="stack">
      <div className="row">
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={onBack}
          disabled={progress !== null}
        >
          <BackIcon />
        </button>
        <h1 className="h1">Trim your clip</h1>
      </div>

      <div className="media vid" style={{ aspectRatio: "16 / 9" }}>
        <video
          ref={video}
          src={url}
          muted
          playsInline
          controls
          preload="metadata"
          style={{ width: "100%", height: "100%" }}
          aria-label="Video preview"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            const d = Number.isFinite(v.duration) ? v.duration : 0;
            setMeta({ duration: d, width: v.videoWidth, height: v.videoHeight });
            setSelection(initialSelection(d));
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setCurrent(v.currentTime);
            if (!v.paused && v.currentTime > selection.end) {
              v.currentTime = selection.start;
            }
          }}
        />
        {meta ? (
          <span className="badge badge-tr" aria-hidden="true">
            {formatDuration(current)} / {formatDuration(length)}
          </span>
        ) : null}
      </div>

      <div className="col">
        <div className="spread">
          <span className="label">Choose up to 30 seconds</span>
          <span className="small muted">
            Selected <strong>{formatDuration(selected)}</strong>
          </span>
        </div>
        <div className="trim-track">
          <div className="trim-sel" style={{ left: `${left}%`, width: `${width}%` }} />
          <input
            type="range"
            className="trim-range"
            min={0}
            max={length || 1}
            step={0.1}
            value={selection.start}
            aria-label="Start of the clip"
            aria-valuetext={formatDuration(selection.start)}
            disabled={!meta || progress !== null}
            onChange={(e) => move("start", Number(e.target.value))}
          />
          <input
            type="range"
            className="trim-range"
            min={0}
            max={length || 1}
            step={0.1}
            value={selection.end}
            aria-label="End of the clip"
            aria-valuetext={formatDuration(selection.end)}
            disabled={!meta || progress !== null}
            onChange={(e) => move("end", Number(e.target.value))}
          />
        </div>
        <div className="spread small muted">
          <span>0:00</span>
          <span>Drag the edges to choose the moment</span>
          <span>{formatDuration(length)}</span>
        </div>
      </div>

      <div className="notice">
        <ShieldIcon />
        <span>
          We&apos;ll shrink the clip on your device before uploading, then blur faces and number plates and
          remove the sound. You can post straight away; it goes live when it&apos;s ready.
        </span>
      </div>

      {progress !== null ? (
        <div className="col" role="status">
          <span className="small">Preparing your clip… {Math.round(progress * 100)}%</span>
          <div className="bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!meta || progress !== null}
        onClick={() => void confirmClip()}
      >
        Use this clip
      </button>
    </div>
  );
}
