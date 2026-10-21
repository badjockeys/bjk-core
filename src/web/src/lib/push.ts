// Web push helpers for the browser. Pure, so they can be tested.

/** A base64url string (the VAPID public key) as bytes, for PushManager.subscribe's applicationServerKey. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** What the API needs from a PushSubscription: its endpoint and the browser's two keys (base64url). */
export function subscriptionKeys(
  json: PushSubscriptionJSON,
): { endpoint: string; p256dh: string; auth: string } | null {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  return endpoint && p256dh && auth ? { endpoint, p256dh, auth } : null;
}

export type PushSupport = "supported" | "unsupported" | "install-first";

/**
 * Whether this browser can have push notifications. iPhones and iPads only allow them for sites added to the Home
 * Screen, so there the answer is "install-first" until it's opened from there.
 */
export function pushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  userAgent: string;
  standalone: boolean;
}): PushSupport {
  const ios = /iPhone|iPad|iPod/.test(env.userAgent);
  if (ios && !env.standalone) {
    return "install-first";
  }
  return env.hasServiceWorker && env.hasPushManager ? "supported" : "unsupported";
}
