// Uploading photos and videos from the browser: ask our server for a signed link, PUT the file straight to storage
// with progress, then tell the API it's there so processing starts.

import { completeUpload, getMedia, requestUpload } from "@/actions/media";

import type { Blocker } from "./viewer";
import type { MediaDto, MediaType, SignedUpload } from "./types";

export class UploadError extends Error {
  constructor(
    message: string,
    readonly blocker?: Blocker,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  "3gp": "video/3gpp",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

/** The types the API accepts (BJK.Modules.Media MediaFormats). */
export const PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/x-ms-bmp",
];
export const VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/3gpp",
  "video/x-m4v",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
  "video/avi",
  "video/msvideo",
];
/**
 * Extensions added to the file pickers' accept lists, for files the browser or OS doesn't give a media type
 * (HEIC from phones, MKV, M4V and MOV on some systems), so they aren't greyed out.
 */
export const PHOTO_EXTENSIONS = [".heic", ".heif", ".avif", ".tif", ".tiff", ".bmp"];
export const VIDEO_EXTENSIONS = [".mov", ".m4v", ".mkv", ".webm", ".avi", ".3gp"];
export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;

/** A file's media type: what the browser says, or from its extension (phones often leave HEIC untyped). */
export function contentTypeOf(file: { name: string; type: string }): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[ext] ?? "";
}

export function kindOf(contentType: string): MediaType | null {
  if (PHOTO_TYPES.includes(contentType)) {
    return "Image";
  }
  if (VIDEO_TYPES.includes(contentType)) {
    return "Video";
  }
  return null;
}

// Headers the browser sets itself and won't let scripts set.
const FORBIDDEN_HEADERS = new Set(["content-length", "host", "connection"]);

/** PUT the file to the signed link, reporting progress from 0 to 1. */
export function putFile(
  upload: SignedUpload,
  body: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method || "PUT", upload.url);
    for (const [name, value] of Object.entries(upload.headers ?? {})) {
      if (!FORBIDDEN_HEADERS.has(name.toLowerCase())) {
        xhr.setRequestHeader(name, value);
      }
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError(`The upload didn't finish (storage said ${xhr.status}). Please try again.`));
    xhr.onerror = () => reject(new UploadError("The upload failed. Check your connection and try again."));
    xhr.send(body);
  });
}

export interface UploadedMedia {
  mediaId: string;
  media: MediaDto;
}

/** Upload one file end to end. Progress covers the transfer; processing happens afterwards on our servers. */
export async function uploadFile(
  body: Blob,
  fileName: string,
  contentType: string,
  onProgress: (fraction: number) => void,
): Promise<UploadedMedia> {
  const ticket = await requestUpload({ fileName, contentType, sizeBytes: body.size });
  if (!ticket.ok) {
    throw new UploadError(ticket.error, ticket.blocker);
  }
  await putFile(ticket.data.upload, body, onProgress);
  const done = await completeUpload(ticket.data.mediaId);
  if (!done.ok) {
    throw new UploadError(done.error, done.blocker);
  }
  return { mediaId: ticket.data.mediaId, media: done.data };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll until processing finishes. Resolves with Ready media; rejects with the reason if it failed. */
export async function waitUntilReady(
  mediaId: string,
  { timeoutMs = 180_000, intervalMs = 2_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<MediaDto> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const result = await getMedia(mediaId);
    if (!result.ok) {
      throw new UploadError(result.error, result.blocker);
    }
    if (result.data.status === "Ready") {
      return result.data;
    }
    if (result.data.status === "Failed" || result.data.status === "Deleted") {
      throw new UploadError(result.data.failureReason ?? "We couldn't process that file.");
    }
    await sleep(intervalMs);
  }
  throw new UploadError("Processing is taking longer than usual. Please try again in a few minutes.");
}
