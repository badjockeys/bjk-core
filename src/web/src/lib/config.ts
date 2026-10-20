/**
 * Every setting the web server reads, from environment variables (src/web/.env.local on a developer's machine,
 * container settings and secrets when deployed). Nothing here is sent to the browser: values the browser needs, such as
 * the Turnstile site key, are passed to components as props, so one image works in every environment.
 */
export interface WebConfig {
  /** The address people use, e.g. https://badjockeys.com. Used for sign-in redirects, links and preview cards. */
  appUrl: URL;
  /** The bjk-core API, e.g. https://api.badjockeys.com. Called from this server only. */
  apiBaseUrl: string;
  /** The identity server (bjk-identity-server), e.g. https://auth.badjockeys.com. */
  authority: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  /** Allow an http:// identity server. Only for local stand-ins (the end-to-end tests); never in real environments. */
  allowHttpAuthority: boolean;
  /** At least 32 characters. Encrypts the session cookie, which holds the user's tokens. */
  authSecret: string;
  turnstileSiteKey: string;
  /** Where photos and videos are served from (the public bucket), for the Content-Security-Policy. */
  mediaOrigins: string[];
  /** Where the browser uploads files to (signed links to the originals bucket), for the Content-Security-Policy. */
  uploadOrigins: string[];
  mapTileUrl: string;
  mapAttribution: string;
}

export const DEFAULT_SCOPES =
  "openid profile email offline_access bjk.profiles bjk.posts bjk.media bjk.users";

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => new URL(v).origin);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Copy src/web/.env.local.example to .env.local (see docs/local-development.md).`,
    );
  }
  return value;
}

let cached: WebConfig | undefined;

/** Read and check the settings once, on first use (not at build time, when they aren't there). */
export function getConfig(): WebConfig {
  if (cached) {
    return cached;
  }

  const authSecret = required("AUTH_SECRET");
  if (authSecret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters (openssl rand -base64 32).");
  }

  cached = {
    appUrl: new URL(required("APP_URL")),
    apiBaseUrl: required("API_BASE_URL").replace(/\/+$/, ""),
    authority: required("IDSRV_AUTHORITY").replace(/\/+$/, ""),
    clientId: process.env.IDSRV_CLIENT_ID?.trim() || "bjk-web",
    clientSecret: required("IDSRV_CLIENT_SECRET"),
    scopes: process.env.IDSRV_SCOPES?.trim() || DEFAULT_SCOPES,
    allowHttpAuthority: process.env.IDSRV_ALLOW_HTTP === "true",
    authSecret,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY?.trim() ?? "",
    mediaOrigins: list(process.env.MEDIA_ORIGINS),
    uploadOrigins: list(process.env.UPLOAD_ORIGINS),
    mapTileUrl: process.env.MAP_TILE_URL?.trim() || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    mapAttribution: process.env.MAP_ATTRIBUTION?.trim() || "© OpenStreetMap contributors",
  };
  return cached;
}

/** True when the site is served over HTTPS, so cookies are Secure and HSTS is sent. */
export function isSecure(config: WebConfig = getConfig()): boolean {
  return config.appUrl.protocol === "https:";
}
