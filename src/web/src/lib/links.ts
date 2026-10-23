/**
 * Web addresses in a post's text (owner, 23 Oct 2026: links are refused in posts to keep spam out). Mirrors the API's
 * TextSafety.ContainsWebAddress, so the form can say so before posting: anything with http(s):// or www., or a bare
 * lower-case domain ending in a common top-level domain. "left.In the lane" and "St.Helens" aren't links.
 */
const EXPLICIT = /(?:\bhttps?:\/\/|(?<![\w.@])www\.)\S+/i;
const BARE =
  /(?<![\w.@-])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.(?:com|net|org|uk|io|ly|tv|info|biz|shop|store|app|link|xyz|site|online|live|gg|ai|eu|ie|top|club|click|win|bet|casino|vip|pro|news|blog|dev|page|icu|cc|ws|ru|cn)(?![\w-])/;

export const LINK_MESSAGE =
  "Links can't be included in posts. Keep it to what happened on the road: the photos or video show the rest.";

export function containsWebAddress(text: string | null | undefined): boolean {
  return !!text && (EXPLICIT.test(text) || BARE.test(text));
}
