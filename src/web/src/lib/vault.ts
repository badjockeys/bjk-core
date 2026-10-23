/** "2 GB", "1.4 GB", "340 MB", "12 KB". */
export function fileSize(bytes: number): string {
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) {
    return `${(bytes / gb).toFixed(bytes % gb === 0 ? 0 : 1)} GB`;
  }
  if (bytes >= mb) {
    return `${Math.round(bytes / mb)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / kb))} KB`;
}

/** How long a plan keeps clips: "30 days", "12 months", "3 years". */
export function keptFor(days: number): string {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "12 months" : `${years} years`;
  }
  return `${days} days`;
}

/** True when a clip goes within a week: the vault warns about it. */
export function expiresSoon(expiresAt: string, now: number = Date.now()): boolean {
  return Date.parse(expiresAt) - now < 7 * 86_400_000;
}

/** Share of the space used, 0 to 1. */
export function usedShare(used: number, limit: number): number {
  return limit <= 0 ? 1 : Math.min(1, Math.max(0, used / limit));
}

/** The vault's collections, like Instagram's saved collections: everything, the originals of your posts, uploads. */
export type VaultCollection = "all" | "posts" | "uploads";

export const VAULT_COLLECTIONS: readonly { id: VaultCollection; name: string; empty: string }[] = [
  { id: "all", name: "All clips", empty: "Nothing in your vault yet." },
  {
    id: "posts",
    name: "From your posts",
    empty: "The originals of your posts appear here once they're published.",
  },
  { id: "uploads", name: "Uploaded", empty: "Clips you add straight to your vault appear here." },
];

/** A collection from the page's ?c= (anything else: none, so the collections show). */
export function parseCollection(value: string | string[] | undefined): VaultCollection | null {
  const one = Array.isArray(value) ? value[0] : value;
  return VAULT_COLLECTIONS.some((c) => c.id === one) ? (one as VaultCollection) : null;
}

/** The API's source filter for a collection. */
export function sourceOf(collection: VaultCollection): "Post" | "Upload" | undefined {
  return collection === "posts" ? "Post" : collection === "uploads" ? "Upload" : undefined;
}

export function collectionName(collection: VaultCollection): string {
  return VAULT_COLLECTIONS.find((c) => c.id === collection)!.name;
}

/** Where a collection opens. */
export function collectionHref(collection: VaultCollection): string {
  return `/account/vault?c=${collection}`;
}

/** Previews the browser can show in a grid; other formats (HEIC, MKV, AVI…) get an icon instead. */
export function previewable(contentType: string): "image" | "video" | null {
  const type = contentType.toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(type)) {
    return "image";
  }
  if (["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"].includes(type)) {
    return "video";
  }
  return null;
}
