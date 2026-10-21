// Finds the moment worth keeping in a video over 30 seconds, for the trim screen's starting handles: loudness every
// half second from the soundtrack, and how much the picture changes, from small frames. Mediabunny decodes both in the
// browser (nothing is uploaded). Anything that goes wrong just means no suggestion.

import { ALL_FORMATS, AudioSampleSink, BlobSource, CanvasSink, Input } from "mediabunny";

import { interestScores, suggestSelection, type Selection } from "./trim";

/** Seconds between measurements. */
const STEP = 0.5;
/** Small frames are enough to see a swerve or a sudden stop. */
const FRAME_WIDTH = 64;
/** Stop measuring after this long, so a very long video can't keep the screen busy. */
const TIME_LIMIT_MS = 12_000;

export async function suggestClip(file: Blob, duration: number): Promise<Selection | null> {
  const started = Date.now();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const steps = Math.ceil(duration / STEP);
  const loudness = await measureLoudness(input, steps, started).catch(() => [] as number[]);
  const change = await measureChange(input, duration, started).catch(() => [] as number[]);
  if (loudness.length === 0 && change.length === 0) {
    return null;
  }
  return suggestSelection(interestScores(loudness, change), STEP, duration);
}

async function measureLoudness(input: Input, steps: number, started: number): Promise<number[]> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) {
    return [];
  }
  const sums = new Array<number>(steps).fill(0);
  const counts = new Array<number>(steps).fill(0);
  const sink = new AudioSampleSink(track);
  for await (const sample of sink.samples()) {
    try {
      const frames = sample.numberOfFrames;
      const data = new Float32Array(frames);
      sample.copyTo(data, { planeIndex: 0, format: "f32-planar" });
      const perStep = Math.max(1, Math.floor(sample.sampleRate * STEP));
      for (let i = 0; i < frames; i += perStep) {
        let sum = 0;
        const end = Math.min(frames, i + perStep);
        for (let j = i; j < end; j++) {
          sum += (data[j] ?? 0) * (data[j] ?? 0);
        }
        const index = Math.floor((sample.timestamp + i / sample.sampleRate) / STEP);
        if (index >= 0 && index < steps) {
          sums[index] = (sums[index] ?? 0) + sum;
          counts[index] = (counts[index] ?? 0) + (end - i);
        }
      }
    } finally {
      sample.close();
    }
    if (Date.now() - started > TIME_LIMIT_MS / 2) {
      break;
    }
  }
  // Loudness in decibels, so a horn stands out against road noise.
  return sums.map((s, i) => 10 * Math.log10(s / Math.max(1, counts[i] ?? 0) + 1e-9));
}

async function measureChange(input: Input, duration: number, started: number): Promise<number[]> {
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    return [];
  }
  const sink = new CanvasSink(track, { width: FRAME_WIDTH, poolSize: 2 });
  const times = Array.from({ length: Math.ceil(duration / STEP) }, (_, i) => i * STEP);
  const change: number[] = [];
  let previous: Uint8ClampedArray | null = null;
  for await (const frame of sink.canvasesAtTimestamps(times)) {
    if (!frame) {
      change.push(0);
      continue;
    }
    const canvas = frame.canvas;
    const context = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data ?? null;
    let difference = 0;
    if (pixels && previous && previous.length === pixels.length) {
      for (let i = 0; i < pixels.length; i += 4) {
        difference +=
          Math.abs((pixels[i] ?? 0) - (previous[i] ?? 0)) +
          Math.abs((pixels[i + 1] ?? 0) - (previous[i + 1] ?? 0));
      }
      difference /= pixels.length / 4;
    }
    change.push(difference);
    previous = pixels ? new Uint8ClampedArray(pixels) : null;
    if (Date.now() - started > TIME_LIMIT_MS) {
      break;
    }
  }
  return change;
}
