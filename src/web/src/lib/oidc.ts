import * as client from "openid-client";

import { getConfig } from "./config";
import { sessionFromTokens, type Session, type SignInTransaction } from "./session";

// Sign-in with bjk-identity-server: OpenID Connect authorization code flow with PKCE, as the confidential client
// bjk-web. openid-client (by the author of jose, certified by the OpenID Foundation) does the protocol work.

let discovered: Promise<client.Configuration> | undefined;

export function oidcConfiguration(): Promise<client.Configuration> {
  discovered ??= discover().catch((error: unknown) => {
    discovered = undefined; // try again next time, e.g. if the identity server was still starting
    throw error;
  });
  return discovered;
}

async function discover(): Promise<client.Configuration> {
  const config = getConfig();
  return client.discovery(
    new URL(config.authority),
    config.clientId,
    config.clientSecret,
    undefined,
    config.allowHttpAuthority ? { execute: [client.allowInsecureRequests] } : undefined,
  );
}

export function callbackUrl(): string {
  return new URL("/api/auth/callback/bjk", getConfig().appUrl).href;
}

/** A fresh authorize request, and the transaction the callback will check it against. */
export async function startSignIn(
  returnTo: string,
  extra: Record<string, string> = {},
): Promise<{ url: URL; transaction: SignInTransaction }> {
  const oidc = await oidcConfiguration();
  const codeVerifier = client.randomPKCECodeVerifier();
  const transaction: SignInTransaction = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier,
    returnTo,
  };
  const url = client.buildAuthorizationUrl(oidc, {
    redirect_uri: callbackUrl(),
    scope: getConfig().scopes,
    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
    state: transaction.state,
    nonce: transaction.nonce,
    ...extra,
  });
  return { url, transaction };
}

/**
 * A page on the identity server (such as /Account/Register or /Account/CheckAge) that continues into a fresh
 * authorize request when it's done, so the user comes back here signed in with a new token. The identity server only
 * follows return addresses on itself, so the authorize request is passed as a path.
 */
export function identityPageThenAuthorize(page: string, authorizeUrl: URL): URL {
  const target = new URL(page, getConfig().authority + "/");
  target.searchParams.set("returnUrl", authorizeUrl.pathname + authorizeUrl.search);
  return target;
}

export async function finishSignIn(currentUrl: URL, transaction: SignInTransaction): Promise<Session> {
  const oidc = await oidcConfiguration();
  const tokens = await client.authorizationCodeGrant(oidc, currentUrl, {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true,
  });
  return sessionFromTokens({
    accessToken: tokens.access_token,
    expiresIn: tokens.expiresIn(),
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
  });
}

/** Swap the (one-time) refresh token for new tokens. Null if the identity server refused it. */
export async function refreshTokens(session: Session): Promise<Session | null> {
  if (!session.refreshToken) {
    return null;
  }
  const oidc = await oidcConfiguration();
  try {
    const tokens = await client.refreshTokenGrant(oidc, session.refreshToken);
    return sessionFromTokens(
      {
        accessToken: tokens.access_token,
        expiresIn: tokens.expiresIn(),
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
      },
      session,
    );
  } catch (error) {
    if (error instanceof client.ResponseBodyError) {
      return null; // invalid_grant: revoked, expired, used already, or the account was deactivated
    }
    throw error;
  }
}

/** Where to send the browser to sign out of the identity server too. */
export async function signOutUrl(session: Session | null): Promise<URL> {
  const oidc = await oidcConfiguration();
  const params: Record<string, string> = { post_logout_redirect_uri: new URL("/", getConfig().appUrl).href };
  if (session?.idToken) {
    params.id_token_hint = session.idToken;
  }
  return client.buildEndSessionUrl(oidc, params);
}

/** Best effort: tell the identity server the refresh token is no longer wanted. */
export async function revokeRefreshToken(session: Session | null): Promise<void> {
  if (!session?.refreshToken) {
    return;
  }
  try {
    const oidc = await oidcConfiguration();
    await client.tokenRevocation(oidc, session.refreshToken, { token_type_hint: "refresh_token" });
  } catch {
    // The token expires on its own; signing out locally still works.
  }
}
