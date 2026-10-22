// Finds an ffmpeg the media worker can use: it must be able to encode H.264 (libx264, for videos) and WebP
// (libwebp, for photos). Homebrew's plain "ffmpeg" formula has no WebP encoder; its "ffmpeg-full" formula does, but
// it's keg-only (not on the PATH), so its full path is used. Shared by setup-local.mjs and the example data.
// Uses only Node.js built-ins.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const NEEDED = ["libx264", "libwebp"];

/** The encoders this ffmpeg is missing (all of them if it doesn't run). */
export function missingEncoders(ffmpeg) {
  const result = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" });
  if (result.status !== 0) return NEEDED;
  return NEEDED.filter((name) => !result.stdout.includes(name));
}

/** Homebrew's ffmpeg-full, if it's installed: { ffmpeg, ffprobe } with full paths, or null. */
function brewFull() {
  const prefix = spawnSync("brew", ["--prefix", "ffmpeg-full"], { encoding: "utf8" });
  if (prefix.status !== 0) return null;
  const bin = join(prefix.stdout.trim(), "bin");
  const tools = { ffmpeg: join(bin, "ffmpeg"), ffprobe: join(bin, "ffprobe") };
  return existsSync(tools.ffmpeg) ? tools : null;
}

/**
 * The ffmpeg and ffprobe to use: plain "ffmpeg"/"ffprobe" on the PATH when they have both encoders, otherwise
 * Homebrew's ffmpeg-full (installed first when install is true and Homebrew is there). Returns
 * { ffmpeg, ffprobe, missing }: missing lists the encoders still lacking (empty when it's fine).
 */
export function findFfmpeg({ install = false } = {}) {
  const plain = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
  const plainMissing = missingEncoders(plain.ffmpeg);
  if (plainMissing.length === 0) return { ...plain, missing: [] };

  let full = brewFull();
  if (!full && install && process.platform === "darwin" && spawnSync("brew", ["--version"]).status === 0) {
    console.log("Your ffmpeg can't make WebP photos; installing Homebrew's ffmpeg-full alongside it (a few minutes)...");
    spawnSync("brew", ["install", "ffmpeg-full"], { stdio: "inherit" });
    full = brewFull();
  }
  if (full) {
    const fullMissing = missingEncoders(full.ffmpeg);
    if (fullMissing.length === 0) return { ...full, missing: [] };
  }
  return { ...plain, missing: plainMissing };
}
