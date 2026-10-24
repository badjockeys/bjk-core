// Where .NET keeps user secrets on this machine, and BJK_USER_SECRETS_DIR in bjk-core/.env, which tells
// docker-compose.yml's "release" profile which folder to mount into the app containers. The containers then read the
// same secrets.json files as F5 (bjk-core-api for the API and media worker, bjk-identity-server for the identity
// server). Used by setup-local.mjs and start-docker.mjs, so a .env from before the release profile is brought up to
// date. Node.js built-ins only.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The folder .NET reads user secrets from, as .NET works it out: %APPDATA%\Microsoft\UserSecrets on Windows,
 * ~/.microsoft/usersecrets on macOS and Linux. Each app's file is <folder>/<UserSecretsId>/secrets.json.
 */
export function userSecretsDir() {
  return process.platform === "win32"
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "UserSecrets")
    : join(homedir(), ".microsoft", "usersecrets");
}

/**
 * Adds BJK_USER_SECRETS_DIR to bjk-core/.env when it's missing or empty, with forward slashes (which Docker accepts
 * on Windows too). An existing value is left alone. Returns the value it added, or undefined. Does nothing if .env
 * doesn't exist yet.
 */
export function ensureUserSecretsDir(core) {
  const envFile = join(core, ".env");
  if (!existsSync(envFile)) return undefined;
  const text = readFileSync(envFile, "utf8");
  const line = /^BJK_USER_SECRETS_DIR=(.*)$/m.exec(text);
  if (line && line[1].trim()) return undefined;
  const value = userSecretsDir().replaceAll("\\", "/");
  const entry = `BJK_USER_SECRETS_DIR=${value}`;
  writeFileSync(envFile, line ? text.replace(line[0], entry) : `${text}${text.endsWith("\n") || !text ? "" : "\n"}${entry}\n`);
  return value;
}
