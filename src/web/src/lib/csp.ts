import type { WebConfig } from "./config";

const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * The Content-Security-Policy for a page. Scripts need this request's nonce (Next.js adds it to its own scripts),
 * and 'strict-dynamic' lets those scripts load the chunks they need, including Turnstile's. Photos, videos and map
 * tiles come only from the configured origins, and uploads only go to the storage origin.
 */
export function contentSecurityPolicy(config: WebConfig, nonce: string, development: boolean): string {
  const tiles = safeOrigin(config.mapTileUrl.replace(/\{[a-z]\}/g, "a"));
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      TURNSTILE,
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // Inline style attributes (React's style prop, the map) need 'unsafe-inline'; styles can't run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...config.mediaOrigins, ...(tiles ? [tiles] : [])],
    "media-src": ["'self'", "blob:", ...config.mediaOrigins],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...config.uploadOrigins, TURNSTILE, ...(development ? ["ws:"] : [])],
    "frame-src": [TURNSTILE],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Sign-in and sign-out forms end with a redirect to the identity server.
    "form-action": ["'self'", safeOrigin(config.authority) ?? "'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(
    ([name, values]) => `${name} ${[...new Set(values)].join(" ")}`,
  );
  if (config.appUrl.protocol === "https:") {
    policy.push("upgrade-insecure-requests");
  }
  return policy.join("; ");
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
