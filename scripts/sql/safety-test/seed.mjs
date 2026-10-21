#!/usr/bin/env node
// Adds the harmless online safety test entries to a LOCAL Bad Jockeys, so the blocking can be tried end to end:
//   - known-image-test.png (a yellow and black "TEST IMAGE" card) on the known-image list, by its SHA-256 and its
//     PDQ perceptual hash: uploading it, or a resized or recompressed copy, is blocked.
//   - blocked-url-test.example on the blocked web address list: a post or comment containing it is held for review.
// The setup (scripts/setup-local.mjs) runs it and then prints which checks work on this machine; you can also run it
// on its own. Needs SQL Server running and the API to have started once. Only ever talks to localhost.
//
//   node scripts/sql/safety-test/seed.mjs
//
// These are the only entries on either list locally. The real lists (the IWF Hash List and URL List) need IWF
// membership and are synced in deployed environments; see "Online safety checks" in docs/local-development.md.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sqlcmd } from "../example-data/seed.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export const TEST_IMAGE = join(here, "known-image-test.png");
export const TEST_URL = "blocked-url-test.example";

// Hashes of known-image-test.png. If you change the picture, recompute them (docs/local-development.md explains how).
const KNOWN = [
  ["Sha256", "10adbff64c4d04faf68f10a7ecc3b878fba65f54cbcf2619687fa436c1387449"],
  ["Pdq", "88aae966f75d16811411c17ac9eeada43efb3e11e155c16e901436915eaaed6e"],
];

const insertHash = ([kind, value]) => `
IF NOT EXISTS (SELECT 1 FROM badjockeys.media.KnownImageHashes WHERE Source = N'Test' AND Kind = N'${kind}' AND Value = '${value}')
  INSERT badjockeys.media.KnownImageHashes (Id, Kind, Value, Source, Reference, AddedAt, AddedBy)
  VALUES (NEWID(), N'${kind}', '${value}', N'Test', N'scripts/sql/safety-test/known-image-test.png', SYSDATETIMEOFFSET(), NULL);`;

/** Adds the test entries (safe to run again). Throws with a readable message if the tables aren't there yet. */
export function seedSafetyTestData() {
  sqlcmd(`SET NOCOUNT ON;
IF OBJECT_ID(N'badjockeys.media.KnownImageHashes') IS NULL OR OBJECT_ID(N'badjockeys.posts.BlockedUrls') IS NULL
  THROW 50000, 'The online safety tables are missing: start the API once (it updates the database), then run this again.', 1;
${KNOWN.map(insertHash).join("\n")}
IF NOT EXISTS (SELECT 1 FROM badjockeys.posts.BlockedUrls WHERE Source = N'Test' AND Pattern = N'${TEST_URL}')
  INSERT badjockeys.posts.BlockedUrls (Id, Pattern, Source, Reference, AddedAt, AddedBy)
  VALUES (NEWID(), N'${TEST_URL}', N'Test', N'Local test entry', SYSDATETIMEOFFSET(), NULL);`);
  console.log(`Online safety test entries added: the test image's two hashes and ${TEST_URL}.`);
}

/** Prints which online safety checks work on this machine and which don't. */
export function safetyCoverage() {
  const rows = [
    ["yes", "Face and number plate blurring", "YuNet models in bjk-core/.local/models"],
    ["yes", "Nudity and graphic content", "CLIP model; rough scores: nudity is held for a moderator, graphic content is blurred and queued"],
    ["test", "Known illegal images", `test list only: upload ${TEST_IMAGE} to see it blocked`],
    ["test", "Blocked web addresses", `test list only: a post or comment containing ${TEST_URL} is held`],
    ["yes", "Threats, slurs and abuse in text", "built-in keyword list (the Detoxify classifier isn't running locally)"],
    ["yes", "Personal details in text", "number plates, phone numbers, emails, street addresses, social handles"],
    ["no", "IWF Hash List and URL List", "need IWF membership; never connected locally"],
  ];
  const mark = { yes: "  [on]   ", test: "  [test] ", no: "  [off]  " };
  console.log("\nOnline safety checks on this machine:");
  for (const [state, name, note] of rows) console.log(`${mark[state]}${name}: ${note}`);
  console.log('  Details: "Online safety checks" in docs/local-development.md');
}

// Run on its own (not imported by the setup).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    seedSafetyTestData();
    safetyCoverage();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
