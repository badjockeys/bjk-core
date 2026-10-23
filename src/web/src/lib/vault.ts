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
