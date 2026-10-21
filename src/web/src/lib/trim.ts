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

/**
 * How interesting each moment is, from two signals measured every `step` seconds: loudness (horns, braking, shouting)
 * and how much the picture changes (swerves, sudden stops). Each is turned into how far above its own typical level
 * it is, so a loud motorway or a busy junction doesn't count by itself: only spikes do. No AI model: it runs in the
 * browser on the trim screen.
 */
export function interestScores(loudness: number[], change: number[]): number[] {
  const length = Math.max(loudness.length, change.length);
  const spikes = (values: number[]) => {
    if (values.length === 0) {
      return new Array<number>(length).fill(0);
    }
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const spread = (sorted[Math.floor(sorted.length * 0.9)] ?? median) - median || 1;
    return Array.from({ length }, (_, i) => Math.max(0, ((values[i] ?? median) - median) / spread));
  };
  const sound = spikes(loudness);
  const motion = spikes(change);
  return Array.from({ length }, (_, i) => (sound[i] ?? 0) + (motion[i] ?? 0));
}

/**
 * The suggested clip for a video over 30 seconds: the stretch with the most going on (the highest total of `scores`,
 * one per `step` seconds), placed so its busiest point is about 60% of the way through, which keeps what led up to it
 * in the clip. Null when nothing stands out (the person starts from the first 30 seconds as before).
 */
export function suggestSelection(scores: number[], step: number, duration: number): Selection | null {
  if (duration <= MAX_CLIP_SECONDS || scores.length === 0 || step <= 0) {
    return null;
  }
  const window = Math.max(1, Math.floor(MAX_CLIP_SECONDS / step));
  if (scores.length <= window) {
    return null;
  }
  let best = -1;
  let bestStart = 0;
  let total = scores.slice(0, window).reduce((sum, s) => sum + s, 0);
  for (let i = 0; i + window <= scores.length; i++) {
    if (i > 0) {
      total += (scores[i + window - 1] ?? 0) - (scores[i - 1] ?? 0);
    }
    if (total > best) {
      best = total;
      bestStart = i;
    }
  }
  if (best < 1) {
    return null;
  }
  // The weighted middle of what's going on in that stretch, about 60% of the way through the clip.
  let weight = 0;
  let moment = 0;
  for (let i = bestStart; i < bestStart + window; i++) {
    weight += scores[i] ?? 0;
    moment += (scores[i] ?? 0) * (i + 0.5) * step;
  }
  const centre = moment / weight;
  const start = clamp(centre - MAX_CLIP_SECONDS * 0.6, 0, duration - MAX_CLIP_SECONDS);
  return { start: round(start), end: round(start + MAX_CLIP_SECONDS) };
}
