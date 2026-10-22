// The trim screen's rules, kept apart from the UI so they can be tested: a clip is 1 to 30 seconds of the video.

export const MAX_CLIP_SECONDS = 30;
export const MIN_CLIP_SECONDS = 1;

export interface Selection {
  start: number;
  end: number;
}

/** The first 30 seconds (or the whole video if it's shorter). */
export function initialSelection(duration: number): Selection {
  return { start: 0, end: round(Math.min(Math.max(duration, 0), MAX_CLIP_SECONDS)) };
}

/**
 * Apply a drag of one edge, keeping the clip between 1 and 30 seconds and inside the video: dragging an edge too far
 * pulls the other edge along.
 */
export function moveEdge(
  selection: Selection,
  edge: "start" | "end",
  value: number,
  duration: number,
): Selection {
  const total = Math.max(duration, 0);
  const minLength = Math.min(MIN_CLIP_SECONDS, total);
  let { start, end } = selection;
  if (edge === "start") {
    start = clamp(value, 0, Math.max(0, total - minLength));
    if (end - start < minLength) {
      end = start + minLength;
    }
    if (end - start > MAX_CLIP_SECONDS) {
      end = start + MAX_CLIP_SECONDS;
    }
  } else {
    end = clamp(value, minLength, total);
    if (end - start < minLength) {
      start = end - minLength;
    }
    if (end - start > MAX_CLIP_SECONDS) {
      start = end - MAX_CLIP_SECONDS;
    }
  }
  return { start: round(clamp(start, 0, total)), end: round(clamp(end, 0, total)) };
}

/** True if the video can be uploaded as it is: the whole of it is chosen and it's 30 seconds or less. */
export function isWholeVideo(selection: Selection, duration: number): boolean {
  return selection.start <= 0.05 && selection.end >= duration - 0.05 && duration <= MAX_CLIP_SECONDS + 0.05;
}

/** The size to shrink to: 720 pixels on the short side (720p), keeping the shape, never enlarging. Null if it's fine. */
export function targetSize(
  width: number,
  height: number,
  shortSide = 720,
): { width: number; height: number } | null {
  if (!width || !height) {
    return null;
  }
  const short = Math.min(width, height);
  if (short <= shortSide) {
    return null;
  }
  const scale = shortSide / short;
  return { width: even(width * scale), height: even(height * scale) };
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
