"use client";

import { useRef, useState } from "react";

import { duration } from "@/lib/format";

/**
 * A video player with play/pause, a seek bar, the time and full screen, but no volume or mute controls: the sound is
 * removed from every uploaded video (Media:Redaction:RemoveAudio), so the browser's own sound controls would do
 * nothing. Always muted, so it can also autoplay where the browser allows it.
 */
export function SilentVideo({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster?: string;
  label: string;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused || v.ended) {
      void v.play().catch(() => undefined);
    } else {
      v.pause();
    }
  };

  const seek = (value: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = value;
    setTime(value);
  };

  const fullScreen = () => {
    const el = frame.current;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else if (el?.requestFullscreen) {
      void el.requestFullscreen().catch(() => undefined);
    } else {
      // iPhone Safari only allows the video element itself to go full screen.
      v?.webkitEnterFullscreen?.();
    }
  };

  return (
    <div ref={frame} className={`silent-video${className ? ` ${className}` : ""}`}>
      <video
        ref={video}
        src={src}
        poster={poster}
        muted
        playsInline
        preload="metadata"
        aria-label={label}
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) =>
          setLength(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
        }
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      >
        Your browser can&apos;t play this video.
      </video>
      <div className="silent-video-bar">
        <button
          type="button"
          className="silent-video-btn"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <input
          type="range"
          className="silent-video-seek"
          min={0}
          max={length || 0}
          step={0.1}
          value={Math.min(time, length || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          aria-valuetext={`${duration(time)} of ${duration(length)}`}
          disabled={!length}
        />
        <span className="silent-video-time">
          {duration(time)} / {duration(length)}
        </span>
        <button type="button" className="silent-video-btn" onClick={fullScreen} aria-label="Full screen">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
