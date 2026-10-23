"use server";

import { revalidatePath } from "next/cache";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type { VaultClipDto, VaultDownloadDto, VaultDto, VaultUploadResult } from "@/lib/types";

import { asUser } from "./run";

/** Your vault: limits, space used and a page of your clips. */
export async function getVault(page = 1): Promise<ActionResult<VaultDto>> {
  return asUser((t) => api().vault.get(t, page));
}

/** Start an upload straight to your vault (refused if it hasn't room). PUT the file, then `completeVaultUpload`. */
export async function requestVaultUpload(file: {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<VaultUploadResult>> {
  return asUser((t) => api().vault.requestUpload(t, file));
}

/** The file is in storage: keep it in the vault. */
export async function completeVaultUpload(clipId: string): Promise<ActionResult<VaultClipDto>> {
  return asUser((t) => api().vault.complete(t, clipId));
}

/** A link, valid for 15 minutes, to download one of your clips. */
export async function getVaultDownload(clipId: string): Promise<ActionResult<VaultDownloadDto>> {
  return asUser((t) => api().vault.download(t, clipId));
}

/** Delete one of your clips now. */
export async function deleteVaultClip(clipId: string): Promise<ActionResult> {
  const result = await asUser((t) => api().vault.remove(t, clipId));
  if (result.ok) {
    revalidatePath("/u/[handle]", "page");
  }
  return result;
}
