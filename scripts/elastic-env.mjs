// Makes sure bjk-core/.env has the three values the local Elastic containers need (docker-compose.yml), adding any
// that are missing or empty: BJK_ELASTIC_PASSWORD (the "elastic" user you sign in to Kibana with),
// BJK_KIBANA_SYSTEM_PASSWORD (the kibana_system user the Kibana server uses behind the scenes; never typed in) and
// BJK_KIBANA_ENCRYPTION_KEY. A .env from before 22 Oct 2026 has BJK_KIBANA_PASSWORD: it's renamed, keeping its
// value. Existing values are never changed: Elasticsearch
// keeps the password it first started with, and Kibana can't read its saved rules with a different key. Used by
// setup-local.mjs and start-docker.mjs, so a .env from before Elastic is brought up to date. Node.js built-ins only.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Letters and digits only, so they need no escaping in YAML, JSON or the shell. */
const lettersAndDigits = (prefix, length) =>
  `${prefix}${randomBytes(length * 2).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, length)}`;

const VALUES = {
  BJK_ELASTIC_PASSWORD: () => lettersAndDigits("Es", 22),
  BJK_KIBANA_SYSTEM_PASSWORD: () => lettersAndDigits("Kb", 22),
  BJK_KIBANA_ENCRYPTION_KEY: () => lettersAndDigits("", 40),
};

/** Adds any missing values to bjk-core/.env; returns the names it added. Does nothing if .env doesn't exist yet. */
export function ensureElasticEnv(core) {
  const envFile = join(core, ".env");
  if (!existsSync(envFile)) return [];
  let text = readFileSync(envFile, "utf8");
  const added = [];
  // Renamed 22 Oct 2026 (it isn't a password anyone signs in to Kibana with).
  if (!/^BJK_KIBANA_SYSTEM_PASSWORD=/m.test(text) && /^BJK_KIBANA_PASSWORD=/m.test(text)) {
    text = text.replace(/^BJK_KIBANA_PASSWORD=/m, "BJK_KIBANA_SYSTEM_PASSWORD=");
    writeFileSync(envFile, text);
  }
  for (const [name, make] of Object.entries(VALUES)) {
    const line = new RegExp(`^${name}=(.*)$`, "m").exec(text);
    if (line && line[1].trim()) continue;
    const value = `${name}=${make()}`;
    text = line ? text.replace(line[0], value) : `${text}${text.endsWith("\n") || !text ? "" : "\n"}${value}\n`;
    added.push(name);
  }
  if (added.length) writeFileSync(envFile, text);
  return added;
}

/** The value of one .env line, or undefined. */
export function readEnvValue(core, name) {
  const envFile = join(core, ".env");
  if (!existsSync(envFile)) return undefined;
  return new RegExp(`^${name}=(.*)$`, "m").exec(readFileSync(envFile, "utf8"))?.[1]?.trim() || undefined;
}
