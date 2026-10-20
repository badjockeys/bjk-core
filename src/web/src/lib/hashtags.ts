// Hashtags in post text (UI step 5): finding them, linking them and suggesting them as # is typed. The rules match the
// API's (bjk-modules HashtagParser): # at the start or after a space or punctuation, then a letter, then up to 49
// letters, digits or underscores. Tags come from posts only, never comments.

export type TextPart = { text: string } | { tag: string };

const TAG = /(?<![\p{L}\p{N}_/&#])#([A-Za-z][A-Za-z0-9_]{1,49})(?![A-Za-z0-9_])/gu;

/** The text split into plain parts and tags (without the #), in order. */
export function splitHashtags(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    const at = m.index ?? 0;
    if (at > last) {
      parts.push({ text: text.slice(last, at) });
    }
    parts.push({ tag: m[1]! });
    last = at + m[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }
  return parts;
}

/** A tag's page, by its lower-case key. */
export function tagPath(tag: string): string {
  return `/tag/${encodeURIComponent(tag.replace(/^#/, "").toLowerCase())}`;
}

/** A tag from the URL, or null if it isn't one. */
export function tagFromPath(value: string): string | null {
  const tag = decodeURIComponent(value).replace(/^#/, "");
  return /^[A-Za-z][A-Za-z0-9_]{1,49}$/.test(tag) ? tag.toLowerCase() : null;
}

/**
 * The tag being typed at the caret, if any: where its # is and what follows it so far (at least one letter). Null
 * when the caret isn't right after "#letters".
 */
export function tagAtCaret(value: string, caret: number): { start: number; prefix: string } | null {
  const before = value.slice(0, caret);
  const m = /(?:^|[^\p{L}\p{N}_/&#])#([A-Za-z][A-Za-z0-9_]{0,49})$/u.exec(before);
  if (!m) {
    return null;
  }
  const prefix = m[1]!;
  return { start: caret - prefix.length - 1, prefix };
}

/** Replaces the tag being typed (from its # to the caret) with the chosen one and a space. */
export function insertTag(
  value: string,
  start: number,
  caret: number,
  tag: string,
): { value: string; caret: number } {
  const after = value.slice(caret);
  const spacer = after.startsWith(" ") ? "" : " ";
  const inserted = `#${tag}${spacer}`;
  return { value: value.slice(0, start) + inserted + after, caret: start + inserted.length };
}

/** "12 posts today" style counts for Trending. */
export function postsToday(n: number): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? "post" : "posts"} today`;
}
