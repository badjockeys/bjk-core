import type { Blocker } from "./viewer";

/**
 * What a server action returns. Actions never throw to the browser (Next.js would hide the message in production),
 * so they report problems in a shape the page can show.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; blocker?: Blocker; fieldErrors?: Record<string, string[]> };
