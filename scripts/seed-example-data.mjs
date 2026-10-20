#!/usr/bin/env node
// Fills a LOCAL Bad Jockeys with example users and posts (scripts/example-data), or removes them again.
//
//   node scripts/seed-example-data.mjs           upload the example photos to S3Mock, then run example-data/seed.sql
//   node scripts/seed-example-data.mjs --remove  run example-data/remove.sql (the photos stay in S3Mock, harmlessly)
//
// Needs SQL Server and S3Mock running (Docker group "bad-jockeys"), and the API and identity server to have started
// once so their databases exist. Only ever talks to localhost.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ids, PASSWORD, posts, users } from "./example-data/data.mjs";

const core = join(dirname(fileURLToPath(import.meta.url)), "..");
const remove = process.argv.includes("--remove");
const S3 = process.env.S3_ENDPOINT ?? "http://localhost:9090";
const BUCKET = process.env.BJK_PUBLIC_BUCKET ?? "bjk-dev-public";
const SQL_CONTAINER = "bad-jockeys-sql-server";

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function sqlPassword() {
  try {
    const password = /^BJK_SQL_PASSWORD=(.+)$/m.exec(readFileSync(join(core, ".env"), "utf8"))?.[1]?.trim();
    if (password) return password;
  } catch {
    // Falls through to the message below.
  }
  fail("Couldn't read BJK_SQL_PASSWORD from bjk-core/.env. Run the setup first (setup.sh or setup.ps1).");
}

function runSql(file) {
  const sql = readFileSync(join(core, "scripts", "example-data", file), "utf8");
  try {
    const output = execFileSync(
      "docker",
      ["exec", "-i", SQL_CONTAINER, "/opt/mssql-tools18/bin/sqlcmd", "-S", "localhost", "-U", "sa", "-P", sqlPassword(), "-C", "-b", "-I"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    process.stdout.write(output);
  } catch (error) {
    process.stdout.write(error.stdout ?? "");
    fail(
      `${file} failed:\n${error.stderr || error.message}\n` +
        "Check SQL Server is running (node scripts/start-docker.mjs) and that the API and identity server have " +
        "started once, so both databases exist.",
    );
  }
}

// --- Placeholder dashcam frames (SVG) ---

const COLOURS = {
  Black: "#1b1b1b", White: "#f2f2f2", Silver: "#c0c4c8", Grey: "#7d8287", Blue: "#2457a6", Red: "#c62f2f",
  Green: "#2e7d4f", Yellow: "#f2c230", Orange: "#e8792b", Brown: "#6b4a2f", Beige: "#d8c8a8", Purple: "#6a3d9a",
  Gold: "#c9a43b", Other: "#888888",
};
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function vehicleShape(type, colour, x, y, scale) {
  const body = COLOURS[colour] ?? "#555555";
  const tall = ["Van", "Lorry", "Bus", "Coach"].includes(type);
  const two = ["Motorbike", "Bicycle", "EScooter"].includes(type);
  if (two) {
    return `<g transform="translate(${x} ${y}) scale(${scale})">
      <rect x="-14" y="-90" width="28" height="70" rx="10" fill="${body}"/>
      <circle cx="0" cy="-110" r="16" fill="#222"/>
      <rect x="-6" y="-20" width="12" height="30" rx="4" fill="#111"/></g>`;
  }
  const w = tall ? 240 : 200;
  const h = tall ? 230 : 120;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect x="${-w / 2}" y="${-h}" width="${w}" height="${h}" rx="16" fill="${body}" stroke="#00000055" stroke-width="3"/>
    <rect x="${-w / 2 + 22}" y="${-h + 16}" width="${w - 44}" height="${tall ? 70 : 40}" rx="8" fill="#2b3640" opacity="0.85"/>
    <rect x="${-w / 2 + 14}" y="-38" width="34" height="16" rx="4" fill="#e04040"/>
    <rect x="${w / 2 - 48}" y="-38" width="34" height="16" rx="4" fill="#e04040"/>
    <rect x="-46" y="-30" width="92" height="22" rx="3" fill="#f5d33a"/>
    <text x="0" y="-13" font-family="Arial, sans-serif" font-size="15" font-weight="700" text-anchor="middle" fill="#111">EXAMPLE</text>
    <rect x="${-w / 2 + 10}" y="0" width="36" height="16" rx="4" fill="#111"/>
    <rect x="${w / 2 - 46}" y="0" width="36" height="16" rx="4" fill="#111"/></g>`;
}

function frame(post, photo, dark) {
  const [vType, , , vColour] = post.vehicle ?? ["Car", null, null, "Grey"];
  const sky = dark ? ["#0b1424", "#1d2a44"] : ["#8cc8ec", "#d9eef8"];
  const ground = dark ? "#18241a" : "#6e9a5a";
  const road = dark ? "#2a2c30" : "#5a5d62";
  const near = photo > 1;
  const date = new Date(Date.now() - post.ago * 86_400_000).toISOString().slice(0, 10);
  const speed = 20 + ((post.n * 7) % 45);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
  <rect width="1600" height="900" fill="url(#s)"/>
  <rect y="430" width="1600" height="470" fill="${ground}"/>
  <polygon points="700,430 900,430 1500,900 100,900" fill="${road}"/>
  <polygon points="790,430 810,430 830,520 770,520" fill="#e8e8e8" opacity="0.9"/>
  <polygon points="760,600 840,600 870,720 730,720" fill="#e8e8e8" opacity="0.9"/>
  <polygon points="700,430 712,430 180,900 120,900" fill="#f0f0f0"/>
  <polygon points="888,430 900,430 1480,900 1420,900" fill="#f0f0f0"/>
  ${dark ? '<circle cx="1300" cy="140" r="40" fill="#f4f1d0" opacity="0.8"/>' : '<circle cx="1320" cy="150" r="60" fill="#fff6c8"/>'}
  ${vehicleShape(vType, vColour, near ? 820 : 860, near ? 700 : 560, near ? 2.1 : 1.1)}
  <rect width="1600" height="900" fill="none" stroke="#000" stroke-width="40" opacity="0.35"/>
  <rect x="0" y="830" width="1600" height="70" fill="#000" opacity="0.6"/>
  <text x="32" y="876" font-family="Courier New, monospace" font-size="34" fill="#ffffff">${date} ${post.time}:${String(10 + photo * 7).padStart(2, "0")}</text>
  <text x="640" y="876" font-family="Courier New, monospace" font-size="34" fill="#ffffff">${speed} MPH</text>
  <text x="1568" y="876" font-family="Arial, sans-serif" font-size="28" fill="#ffffff" text-anchor="end">${escape(post.at[2])}</text>
  <text x="32" y="64" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff" opacity="0.9">EXAMPLE CLIP · NOT A REAL INCIDENT</text>
  <circle cx="1556" cy="54" r="14" fill="#e53935"/><text x="1530" y="64" font-family="Arial, sans-serif" font-size="30" fill="#ffffff" text-anchor="end">REC</text>
</svg>`;
}

async function uploadPhotos() {
  let count = 0;
  for (const post of posts) {
    const [h, m] = post.time.split(":").map(Number);
    const dark = h * 60 + m < 450 || h * 60 + m >= 1095;
    for (let photo = 1; photo <= post.photos; photo++) {
      const key = `examples/${ids.mediaId(post.n, photo)}.svg`;
      let response;
      try {
        response = await fetch(`${S3}/${BUCKET}/${key}`, {
          method: "PUT",
          headers: { "Content-Type": "image/svg+xml" },
          body: frame(post, photo, dark),
        });
      } catch {
        fail(`Couldn't reach S3Mock at ${S3}. Start it with: node scripts/start-docker.mjs`);
      }
      if (!response.ok) fail(`S3Mock refused ${key} (${response.status}). Is the bucket ${BUCKET} there?`);
      count++;
    }
  }
  console.log(`Uploaded ${count} example photos to ${S3}/${BUCKET}/examples/.`);
}

if (remove) {
  runSql("remove.sql");
} else {
  await uploadPhotos();
  runSql("seed.sql");
  console.log(`\nDone. Sign in at the web app as any example user (password ${PASSWORD}), e.g. ${users[0].email}.`);
}
