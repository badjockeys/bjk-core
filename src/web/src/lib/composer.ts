/** "Seen some bad driving, Aaron?" at the top of the feed: the first name only, or just the question without one. */
export function composerPrompt(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first && !first.includes("@") ? `Seen some bad driving, ${first}?` : "Seen some bad driving?";
}
