// Collects the posts a viewer has seen and sends them in batches, so a scrolling feed makes one request every few
// seconds rather than one per post. Pure apart from the timer, so it's easy to test.

export const SEEN_AFTER_MS = 1000;
export const FLUSH_EVERY_MS = 4000;
export const MAX_BATCH = 50;

export interface ViewBatch {
  /** Note a post as seen (once per page load). */
  add(postId: string): void;
  /** Send what's waiting now (the page is being hidden). */
  flush(): void;
}

export function createViewBatch(
  send: (postIds: string[]) => void,
  schedule: (run: () => void, ms: number) => unknown = (run, ms) => setTimeout(run, ms),
): ViewBatch {
  const sent = new Set<string>();
  let waiting: string[] = [];
  let timer: unknown = null;

  const flush = () => {
    timer = null;
    while (waiting.length > 0) {
      send(waiting.slice(0, MAX_BATCH));
      waiting = waiting.slice(MAX_BATCH);
    }
  };

  return {
    add(postId: string) {
      if (sent.has(postId)) {
        return;
      }
      sent.add(postId);
      waiting.push(postId);
      if (waiting.length >= MAX_BATCH) {
        flush();
      } else if (timer === null) {
        timer = schedule(flush, FLUSH_EVERY_MS);
      }
    },
    flush,
  };
}
