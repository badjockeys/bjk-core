// Checks the licences of everything that ships in the web app (production dependencies in package-lock.json).
// Fails on copyleft licences (GPL, AGPL). LGPL is allowed only for the server-side image library's native binaries,
// which Next.js loads on the server and never sends to browsers. Prints a summary for the pull request.
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const ALLOWED =
  /^(MIT|ISC|BSD-2-Clause|BSD-3-Clause|0BSD|Apache-2\.0|MPL-2\.0|CC0-1\.0|CC-BY-4\.0|BlueOak-1\.0\.0|Unlicense|Python-2\.0)$/;
const SERVER_ONLY_LGPL = /^node_modules\/@img\/sharp-libvips-/;

const counts = new Map();
const problems = [];
for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (!path || info.dev || info.devOptional) continue;
  const licence = String(info.license ?? "UNKNOWN");
  counts.set(licence, (counts.get(licence) ?? 0) + 1);
  const parts = licence.replace(/[()]/g, "").split(/\s+(?:OR|AND)\s+/);
  const ok = licence.includes(" OR ")
    ? parts.some((p) => ALLOWED.test(p))
    : parts.every((p) => ALLOWED.test(p));
  if (!ok && !(SERVER_ONLY_LGPL.test(path) && /LGPL/.test(licence))) {
    problems.push(`${path.replace(/^node_modules\//, "")}: ${licence}`);
  }
}

const summary = [...counts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([l, n]) => `${l} ${n}`)
  .join(", ");
console.log(`Production dependency licences: ${summary}`);
if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Web licences::${summary}`);
if (problems.length > 0) {
  console.error(`Licences that need a decision:\n${problems.join("\n")}`);
  process.exit(1);
}
