// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  chunk,
  decodeJwtClaims,
  needsRefresh,
  readChunked,
  sealSession,
  sessionFromTokens,
  unsealSession,
  writeSession,
  type Session,
} from "@/lib/session";

const SECRET = "test-secret-that-is-at-least-32-characters";

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "at+jwt" })}.${encode(claims)}.signature`;
}

const session: Session = {
  sub: "11111111-1111-1111-1111-111111111111",
  accessToken: jwt({ sub: "11111111-1111-1111-1111-111111111111", exp: 2_000_000_000 }),
  accessTokenExpiresAt: 2_000_000_000,
  refreshToken: "refresh-1",
  ageVerified: true,
  emailVerified: true,
};

describe("session cookie", () => {
  it("round-trips encrypted, and refuses another key", async () => {
    const sealed = await sealSession(session, SECRET);
    expect(sealed).not.toContain("refresh-1");
    expect(await unsealSession(sealed, SECRET)).toEqual(session);
    expect(await unsealSession(sealed, `${SECRET}-other`)).toBeNull();
    expect(await unsealSession("not-a-token", SECRET)).toBeNull();
  });

  it("splits long values over numbered cookies and joins them back", () => {
    const value = "x".repeat(9000);
    const parts = chunk("bjk_session", value);
    expect(parts.map((p) => p.name)).toEqual(["bjk_session.0", "bjk_session.1", "bjk_session.2"]);
    expect(readChunked({ getAll: () => parts }, "bjk_session")).toBe(value);
    expect(readChunked({ getAll: () => parts.slice(1) }, "bjk_session")).toBeUndefined();
  });

  it("writes chunks with httpOnly, Lax cookies and deletes leftovers", async () => {
    const written: { name: string; options: { httpOnly: boolean; sameSite: string; secure: boolean } }[] = [];
    const deleted: string[] = [];
    const reader = {
      getAll: () => [
        { name: "bjk_session.0", value: "old" },
        { name: "bjk_session.5", value: "old" },
      ],
    };
    await writeSession(
      reader,
      {
        set: (name, _value, options) => written.push({ name, options }),
        delete: (name) => deleted.push(name),
      },
      session,
      SECRET,
      false,
    );
    expect(written[0]?.name).toBe("bjk_session.0");
    expect(written[0]?.options).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
    expect(deleted).toEqual(["bjk_session.5"]);
  });

  it("reads the age check and email claims from the access token", () => {
    const built = sessionFromTokens({
      accessToken: jwt({
        sub: "u1",
        exp: 1_900_000_000,
        age_verified: "true",
        email_verified: "true",
        email: "a@b.c",
      }),
      refreshToken: "r2",
    });
    expect(built).toMatchObject({ sub: "u1", ageVerified: true, emailVerified: true, email: "a@b.c" });

    const notChecked = sessionFromTokens({ accessToken: jwt({ sub: "u1", exp: 1_900_000_000 }) }, built);
    expect(notChecked.ageVerified).toBe(false);
    expect(notChecked.refreshToken).toBe("r2");
  });

  it("refreshes a minute before expiry", () => {
    const at = 1_000_000_000_000;
    expect(needsRefresh({ ...session, accessTokenExpiresAt: at / 1000 + 120 }, at)).toBe(false);
    expect(needsRefresh({ ...session, accessTokenExpiresAt: at / 1000 + 30 }, at)).toBe(true);
    expect(decodeJwtClaims("garbage")).toEqual({});
  });
});
