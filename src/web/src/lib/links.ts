// Sensitive media for age-verified members come as signed links that stop working after about 10 minutes
// (`linksExpireAt` on each photo or video). Pages fetch fresh ones shortly before then.

/** The earliest `linksExpireAt` of these posts' media (signed links to sensitive media), or null. */
export function earliestExpiry(posts: { media: { linksExpireAt?: string | null }[] }[]): string | null {
  let earliest: number | null = null;
  for (const post of posts) {
    for (const m of post.media) {
      const at = m.linksExpireAt ? Date.parse(m.linksExpireAt) : NaN;
      if (!Number.isNaN(at) && (earliest === null || at < earliest)) {
        earliest = at;
      }
    }
  }
  return earliest === null ? null : new Date(earliest).toISOString();
}

/** How long before a link expires to fetch fresh ones. */
export const REFRESH_MARGIN_MS = 30_000;

/** Milliseconds until fresh links should be fetched (never negative), or null if nothing expires. */
export function refreshDelay(expiresAt: string | null, at: number = Date.now()): number | null {
  if (!expiresAt) {
    return null;
  }
  const when = Date.parse(expiresAt);
  return Number.isNaN(when) ? null : Math.max(0, when - REFRESH_MARGIN_MS - at);
}
