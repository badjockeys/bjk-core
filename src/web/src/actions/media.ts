"use server";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { MediaDto, RequestUploadResult, ShareCopyDto } from "@/lib/types";

import { asUser } from "./run";

/**
 * Ask the API for a short-lived signed link to upload one file. The browser then PUTs the file straight to storage
 * (S3Mock locally, Cloudflare R2 in the cloud), so it never passes through this server or the API.
 */
export async function requestUpload(file: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  /** When posting a clip from your vault: the clip, so it isn't kept in the vault twice. */
  vaultClipId?: string | null;
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

/** Ask for your video's vertical copy for TikTok, Reels, Shorts and X (owner only). */
export async function requestShareCopy(mediaId: string): Promise<ActionResult<ShareCopyDto>> {
  return asUser((t) => api().media.requestShareCopy(t, mediaId));
}

/** Your video's vertical copy: whether it's made yet, with a short-lived download link once it is. */
export async function getShareCopy(mediaId: string): Promise<ActionResult<ShareCopyDto>> {
  return asUser((t) => api().media.shareCopy(t, mediaId));
}

/** Remove an upload that's no longer wanted (taken off the new post before posting). */
export async function discardMedia(mediaId: string): Promise<ActionResult> {
  return asUser((t) => api().media.remove(t, mediaId));
}
