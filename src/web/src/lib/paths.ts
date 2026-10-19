/** Only same-site paths are accepted as "return to" addresses, so sign-in can't be used to redirect elsewhere. */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  return value;
}

export function postPath(id: string): string {
  return `/p/${id}`;
}

export function profilePath(handle: string): string {
  return `/@${handle}`;
}

export function signInPath(returnTo: string): string {
  return `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

export function joinPath(returnTo: string): string {
  return `/auth/join?returnTo=${encodeURIComponent(returnTo)}`;
}

export function checkAgePath(returnTo: string): string {
  return `/auth/check-age?returnTo=${encodeURIComponent(returnTo)}`;
}
