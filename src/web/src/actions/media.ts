"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { MediaDto, RequestUploadResult } from "@/lib/types";

import { asUser } from "./run";

/**
 * Ask the API for a short-lived signed link to upload one file. The browser then PUTs the file straight to storage
 * (S3Mock locally, Cloudflare R2 in the cloud), so it never passes through this server or the API.
 */
export async function requestUpload(file: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<RequestUploadResult>> {
  return asUser((t) => api().media.requestUpload(t, file));
}

/** The file is in storage: queue it for processing (blurring, 720p, WebP). */
export async function completeUpload(mediaId: string): Promise<ActionResult<MediaDto>> {
  return asUser((t) => api().media.complete(t, mediaId));
}

export async function getMedia(mediaId: string): Promise<ActionResult<MediaDto>> {
  return asUser((t) => api().media.get(t, mediaId));
}

/** Remove an upload that's no longer wanted (taken off the new post before posting). */
export async function discardMedia(mediaId: string): Promise<ActionResult> {
  return asUser((t) => api().media.remove(t, mediaId));
}
