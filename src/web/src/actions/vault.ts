"use server";

import { revalidatePath } from "next/cache";

import { api } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import type {
  VaultClipDto,
  VaultDownloadDto,
  VaultDto,
  VaultPreviewDto,
  VaultSettingsDto,
  VaultUploadResult,
} from "@/lib/types";
import { sourceOf, type VaultCollection } from "@/lib/vault";

import { asUser } from "./run";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Your vault: limits, space used and a page of one collection's clips. */
export async function getVault(
  page = 1,
  collection: VaultCollection = "all",
): Promise<ActionResult<VaultDto>> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  return asUser((t) => api().vault.get(t, safePage, 30, sourceOf(collection)));
}

/** Links that show your clips in the grid (up to 50; anything that isn't one of yours is left out). */
export async function getVaultPreviews(ids: string[]): Promise<ActionResult<VaultPreviewDto[]>> {
  const valid = Array.from(new Set(ids.filter((id) => ID.test(id)))).slice(0, 50);
  if (valid.length === 0) return { ok: true, data: [] };
  return asUser((t) => api().vault.previews(t, valid));
}

/** Turn keeping your posts' originals automatically on or off. */
export async function setVaultAutoSave(on: boolean): Promise<ActionResult<VaultSettingsDto>> {
  const result = await asUser((t) => api().vault.setAutoSave(t, on === true));
  if (result.ok) {
    revalidatePath("/account/vault");
  }
  return result;
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
    revalidatePath("/account/vault");
  }
  return result;
}
