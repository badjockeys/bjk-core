// The service worker, for push notifications only: it shows what the API pushes and opens the right page when it's
// tapped. It caches nothing, so the site never serves stale pages. Served from the root so its scope is the whole
// site. Messages come from the API encrypted to this browser (RFC 8291); the push service can't read them.

const SCRIPT = `"use strict";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    data: { url: typeof data.url === "string" ? data.url : "/notifications" },
  };
  if (typeof data.tag === "string" && data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(typeof data.title === "string" ? data.title : "Bad Jockeys", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/notifications", self.location.origin);
  if (target.origin !== self.location.origin) {
    return;
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await client.navigate(target.href).catch(() => undefined);
          }
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
`;

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(SCRIPT, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Browsers check for a new version on each visit when it isn't cached.
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
