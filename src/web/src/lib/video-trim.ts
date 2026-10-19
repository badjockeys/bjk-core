// Trims a clip to the chosen moment and shrinks it to 720p in the browser before upload, with the sound removed.
// Uses Mediabunny (MPL-2.0, WebCodecs, no WebAssembly: a few hundred KB), loaded only on the trim screen. ffmpeg.wasm
// was the alternative, but its core is ~30 MB and the build with an H.264 encoder (x264) is GPL.

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

import { targetSize, type Selection } from "./trim";

/** Whether this browser can re-encode video (WebCodecs). Without it the clip is uploaded as it is. */
export function canTrimInBrowser(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

export async function trimAndShrink(
  file: Blob,
  selection: Selection,
  size: { width: number; height: number },
  onProgress: (fraction: number) => void,
): Promise<Blob> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const target = targetSize(size.width, size.height);

  const conversion = await Conversion.init({
    input,
    output,
    video: target ? { width: target.width, height: target.height, fit: "contain" } : {},
    audio: { discard: true },
    trim: { start: selection.start, end: selection.end },
  });
  if (!conversion.isValid) {
    throw new Error("This browser can't convert this video.");
  }
  conversion.onProgress = (progress: number) => onProgress(progress);
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("The converted video was empty.");
  }
  return new Blob([buffer], { type: "video/mp4" });
}
