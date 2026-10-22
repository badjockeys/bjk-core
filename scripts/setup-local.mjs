#!/usr/bin/env node
// Sets up Bad Jockeys for local development on macOS, Windows or Linux. Safe to re-run.
//
//   node scripts/setup-local.mjs                 everything (run from bjk-core)
//   node scripts/setup-local.mjs --config-only   just create your local config files
//
// It follows docs/local-development.md:
//   1. checks the tools (.NET, Node.js, Docker, ffmpeg) and access to the private package feed (from the GitHub
//      CLI's sign-in, saved in your user-level NuGet.Config)
//   2. creates your git-ignored config files from the templates, with your own SQL password and secrets
//      (bjk-core/.env, the identity server's and the API's .NET user secrets, src/web/.env.local);
//      files that already exist are left alone
//   3. trusts the .NET HTTPS development certificate and exports it for Node.js
//   4. starts SQL Server, S3Mock, Elasticsearch, Kibana and the OpenTelemetry collector in Docker, as the group
//      "bad-jockeys" (bjk-core's docker-compose.yml)
//   5. (user secrets are written straight into .NET's user secrets store in step 2; edit them with "Manage User
//      Secrets" on BJK.Core.Api or BJK.Idsrv.Host; the media worker shares the API's)
//   6. downloads the face and number plate blurring models and the CLIP content model into bjk-core/.local/models
//   7. builds the .NET apps and installs the web app's packages
//   8. adds example users and posts (scripts/sql/example-data), starting the identity server and the API for a
//      moment first so their databases exist, and gives the owner account its plan (Plans:Overrides); adds the
//      harmless online safety test entries (scripts/sql/safety-test) and says which checks work on this machine
//
// Needs the tools installed and bjk-identity-server cloned next to bjk-core: scripts/setup/setup.ps1 (Windows) and
// scripts/setup/setup.sh (macOS) do both, then run this. Uses only Node.js built-ins.

import { spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { removeOldGroups, startServices } from "./docker-services.mjs";
import { findFfmpeg } from "./ffmpeg-tools.mjs";
import { ensureElasticEnv, readEnvValue } from "./elastic-env.mjs";
import { OWNER_EMAIL, OWNER_PLAN } from "./sql/example-data/data.mjs";
import { applyReporting, reportingPassword } from "./sql/reporting/apply.mjs";
import { ownerId, seedExampleData } from "./sql/example-data/seed.mjs";
import { safetyCoverage, seedSafetyTestData } from "./sql/safety-test/seed.mjs";

const core = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const idsrv = resolve(core, "..", "bjk-identity-server");
const web = join(core, "src", "web");
const models = join(core, ".local", "models");
const isWindows = process.platform === "win32";
const configOnly = process.argv.includes("--config-only");

// Pinned, SHA-256 checked; keep in step with pipelines/scripts/download-redaction-models.sh.
const OPENCV_ZOO =
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models";
const MODELS = [
  {
    file: "face_detection_yunet_2026may.onnx",
    url: `${OPENCV_ZOO}/face_detection_yunet/face_detection_yunet_2026may.onnx`,
    sha256: "ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0",
  },
  {
    file: "license_plate_detection_lpd_yunet_2023mar.onnx",
    url: `${OPENCV_ZOO}/license_plate_detection_yunet/license_plate_detection_lpd_yunet_2023mar.onnx`,
    sha256: "6d4978a7b6d25514d5e24811b82bfb511d166bdd8ca3b03aa63c1623d4d039c7",
  },
  {
    // OpenAI CLIP ViT-B/32 (MIT), Xenova's quantised ONNX export of the vision model: the nudity and graphic content check.
    file: "clip-vit-b32-vision-quantized.onnx",
    url: "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/onnx/vision_model_quantized.onnx",
    sha256: "583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299",
  },
  {
    // People (YOLOX-S, Apache 2.0): the worker blurs the head of everyone it finds, as a backup for the face model.
    file: "object_detection_yolox_2022nov.onnx",
    url: `${OPENCV_ZOO}/object_detection_yolox/object_detection_yolox_2022nov.onnx`,
    sha256: "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
  },
  {
    // The identity server's head-turn liveness check (the age check); the version its YuNet decoder reads.
    file: "face_detection_yunet_2023mar.onnx",
    url: `${OPENCV_ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
    sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  },
];

/** The content check settings the setup writes into the API's user secrets: CLIP runs when ModelPath is set. */
const sensitiveDetection = () => ({ ModelPath: join(models, MODELS[2].file) });
const personModel = () => join(models, MODELS[3].file);
const livenessModel = () => join(models, MODELS[4].file);

const colour = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const step = (text) => console.log(`\n${colour("1;36", `== ${text}`)}`);
const ok = (text) => console.log(colour("32", text));
function fail(text) {
  console.error(colour("1;31", `\n${text}`));
  process.exit(1);
}

/**
 * npm is a .cmd file on Windows, which only runs through a shell. Everything else (dotnet, docker, ffmpeg) is an
 * .exe and runs without one, so paths with spaces in them (C:\Users\Sam Jones\...) reach it intact.
 */
const needsShell = (command) => isWindows && command === "npm";

/** Runs a command, showing its output. Returns true if it exited with 0. */
function run(command, args, { cwd = core, input, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    stdio: [input === undefined ? "inherit" : "pipe", quiet ? "pipe" : "inherit", quiet ? "pipe" : "inherit"],
    shell: needsShell(command),
    encoding: "utf8",
  });
  return result.status === 0;
}

/** Runs a command and returns its trimmed output, or null if it failed or isn't installed. */
function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: needsShell(command) });
  return result.status === 0 ? result.stdout.trim() : null;
}

function mustRun(command, args, options, hint) {
  if (!run(command, args, options)) fail(`${command} ${args.join(" ")} failed.${hint ? ` ${hint}` : ""}`);
}

/** A SQL Server sa password: upper, lower, digit and symbol, and nothing that needs escaping in a connection string. */
function sqlPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let body = "";
  for (const b of bytes) body += alphabet[b % alphabet.length];
  return `Bjk-${body}9a`;
}

const secret = () => randomBytes(32).toString("base64url");

/** A VAPID key pair for web push (P-256): the public key as an uncompressed point and the private scalar, base64url. */
function vapidKeys() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);
  return { PublicKey: point.toString("base64url"), PrivateKey: jwk.d };
}

/** The ffmpeg and ffprobe the apps use (see ffmpeg-tools.mjs); found by checkTools, or by createConfig on its own. */
let ffmpegTools = null;

/**
 * Points every ffmpeg setting at the ffmpeg found, when it isn't plain "ffmpeg" on the PATH (Homebrew's ffmpeg-full is
 * keg-only). Only replaces the default or an empty value, so a path you set yourself is kept.
 */
function useFfmpeg(file, sections) {
  if (!existsSync(file)) return;
  ffmpegTools ??= findFfmpeg();
  if (ffmpegTools.ffmpeg === "ffmpeg") return;
  const json = JSON.parse(readFileSync(file, "utf8"));
  let changed = false;
  for (const path of sections) {
    let node = json;
    for (const key of path) node = node[key] ??= {};
    for (const [key, tool] of [["FfmpegPath", "ffmpeg"], ["FfprobePath", "ffprobe"]]) {
      if (key === "FfprobePath" && !("FfprobePath" in node)) continue;
      if (unset(node[key]) || node[key] === tool) {
        node[key] = ffmpegTools[tool];
        changed = true;
      }
    }
  }
  if (changed) {
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    ok(`${file.replace(`${resolve(core, "..")}/`, "")}: ffmpeg settings point at ${ffmpegTools.ffmpeg}`);
  }
}

function checkTools() {
  step("Checking tools");
  const missing = [];
  const dotnet = output("dotnet", ["--version"]);
  if (!dotnet) missing.push(".NET SDK 10 (https://dotnet.microsoft.com/download)");
  else if (Number(dotnet.split(".")[0]) < 10) missing.push(`.NET SDK 10 or later (you have ${dotnet})`);
  const node = process.versions.node;
  if (Number(node.split(".")[0]) < 24) console.log(colour("33", `Node.js ${node}: the web app expects 24 or later.`));
  if (!output("docker", ["--version"])) missing.push("Docker Desktop (https://www.docker.com/products/docker-desktop)");
  if (!output("ffmpeg", ["-version"])) {
    missing.push(isWindows ? "ffmpeg (winget install Gyan.FFmpeg)" : "ffmpeg (brew install ffmpeg-full)");
  } else {
    // The media worker needs H.264 (videos) and WebP (photos) encoders; Homebrew's plain ffmpeg has no WebP.
    ffmpegTools = findFfmpeg({ install: true });
    if (ffmpegTools.missing.length) {
      missing.push(
        `an ffmpeg with the ${ffmpegTools.missing.join(" and ")} encoder${ffmpegTools.missing.length > 1 ? "s" : ""} ` +
          (isWindows ? "(winget install Gyan.FFmpeg, the full build)" : "(brew install ffmpeg-full)"),
      );
    }
  }
  if (missing.length) fail(`Missing: ${missing.join("; ")}. See step 1 of docs/local-development.md.`);
  if (!output("docker", ["info"])) fail("Docker Desktop isn't running. Start it, then run this again.");
  const ffmpegVersion = output(ffmpegTools.ffmpeg, ["-version"]) ?? "ffmpeg";
  ok(`.NET ${dotnet}, Node.js ${node}, ${ffmpegVersion.split("\n")[0].split(" ").slice(0, 3).join(" ")} (${ffmpegTools.ffmpeg}), Docker running`);
}

/** The user-level NuGet.Config, which every project on this computer reads alongside its own nuget.config. */
function userNuGetConfig() {
  return isWindows
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "NuGet", "NuGet.Config")
    : join(homedir(), ".nuget", "NuGet", "NuGet.Config");
}

/**
 * The BJK.Modules packages are on GitHub Packages, which needs a GitHub token with read:packages. Uses, in order:
 * the NuGetPackageSourceCredentials_badjockeys environment variable; credentials already in the user-level
 * NuGet.Config; or the GitHub CLI's sign-in (gh auth login --scopes read:packages), saved into that NuGet.Config so
 * every terminal and editor picks it up, with no environment variable to set.
 */
function ensurePackageCredentials() {
  step("Checking access to the Bad Jockeys package feed");
  if (process.env.NuGetPackageSourceCredentials_badjockeys) {
    ok("Using NuGetPackageSourceCredentials_badjockeys");
    return;
  }
  const file = userNuGetConfig();
  const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
  const hasOurs = existing && /<packageSourceCredentials>[\s\S]*<badjockeys>[\s\S]*<\/packageSourceCredentials>/.test(existing);

  const login = output("gh", ["api", "user", "--jq", ".login"]);
  const token = login && output("gh", ["auth", "token", "-h", "github.com"]);
  // One of the private packages stands in for all of them: this checks both the read:packages scope and access.
  const canReadPackages = token && output("gh", ["api", "orgs/badjockeys/packages/nuget/BJK.Modules.Media"]) !== null;
  if (!canReadPackages) {
    if (hasOurs) {
      ok(`Using the credentials in ${file}`);
      return;
    }
    fail(
      "No GitHub access for the private BJK.Modules packages. Either run the full setup (scripts/setup/setup.ps1 on Windows,\n" +
        "scripts/setup/setup.sh on a Mac), or sign in with the GitHub CLI and run this again:\n" +
        "  gh auth login --web --scopes read:packages      (or, if you're already signed in: gh auth refresh -s read:packages)\n" +
        "If you're signed in but still see this, your GitHub account needs access to the badjockeys organisation's repos.",
    );
  }

  const block =
    `    <badjockeys>\n` +
    `      <add key="Username" value="${login}" />\n` +
    `      <add key="ClearTextPassword" value="${token}" />\n` +
    `    </badjockeys>\n`;
  let xml;
  if (!existing) {
    // A new user-level config needs nuget.org too, or other projects on this computer would lose it.
    xml =
      `<?xml version="1.0" encoding="utf-8"?>\n<configuration>\n  <packageSources>\n` +
      `    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />\n` +
      `  </packageSources>\n  <packageSourceCredentials>\n${block}  </packageSourceCredentials>\n</configuration>\n`;
  } else if (hasOurs) {
    xml = existing.replace(/[ \t]*<badjockeys>[\s\S]*?<\/badjockeys>\r?\n?/, block);
  } else if (existing.includes("<packageSourceCredentials>")) {
    xml = existing.replace("<packageSourceCredentials>", `<packageSourceCredentials>\n${block.trimEnd()}`);
  } else {
    xml = existing.replace("</configuration>", `  <packageSourceCredentials>\n${block}  </packageSourceCredentials>\n</configuration>`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, xml);
  ok(`Signed in to GitHub as ${login}; package feed access saved in ${file}`);
}

function writeIfMissing(file, content, label) {
  if (existsSync(file)) {
    console.log(`${label}: already there, left as it is`);
    return false;
  }
  writeFileSync(file, content);
  ok(`${label}: created`);
  return true;
}

/**
 * The .NET user secrets file for a UserSecretsId: what "Manage User Secrets" opens (Rider, Visual Studio, or VS Code
 * with the C# Dev Kit), and what the app reads in Development. The setup writes straight into it.
 */
function userSecretsFile(id) {
  const root = isWindows
    ? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Microsoft", "UserSecrets")
    : join(homedir(), ".microsoft", "usersecrets");
  return join(root, id, "secrets.json");
}

/** The API's (shared with the media worker) and the identity server's user secrets. */
const CORE_SECRETS = userSecretsFile("bjk-core-api");
const IDSRV_SECRETS = userSecretsFile("bjk-identity-server");

/**
 * Turns flat keys ("Media:Redaction:FaceModelPath", which `dotnet user-secrets set` writes) into nested sections, so
 * the file reads like appsettings.json. Sections whose keys are 0, 1, 2... become arrays.
 */
function nest(flat) {
  const root = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(":");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
      node = node[part];
    }
    const last = parts.at(-1);
    node[last] = value !== null && typeof value === "object" && !Array.isArray(value) ? { ...(node[last] ?? {}), ...nest(value) } : value;
  }
  const arrays = (node) => {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return node;
    for (const key of Object.keys(node)) node[key] = arrays(node[key]);
    const keys = Object.keys(node);
    return keys.length > 0 && keys.every((k, i) => k === String(i)) ? keys.map((k) => node[k]) : node;
  };
  return arrays(root);
}

/**
 * Makes sure a user secrets file exists and is nested. In order: a bjk-core/ or bjk-identity-server/user-secrets.json
 * from before 22 Oct 2026 (the setup used to keep a copy there and load it) is moved in and renamed .moved; an
 * existing secrets file is kept (only flattened keys are nested); otherwise it's made from the template.
 */
function ensureUserSecrets(file, oldCopy, makeFromTemplate, label) {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(oldCopy)) {
    writeFileSync(file, `${JSON.stringify(nest(JSON.parse(readFileSync(oldCopy, "utf8"))), null, 2)}\n`);
    renameSync(oldCopy, `${oldCopy}.moved`);
    ok(`${label}: moved into the app's user secrets (${file}); the old copy is now ${oldCopy}.moved and isn't used`);
    return;
  }

  if (existsSync(file) && readFileSync(file, "utf8").trim()) {
    const current = JSON.parse(readFileSync(file, "utf8"));
    if (Object.keys(current).some((k) => k.includes(":"))) {
      writeFileSync(file, `${JSON.stringify(nest(current), null, 2)}\n`);
      ok(`${label}: tidied into sections (${file})`);
    } else {
      console.log(`${label}: already there, kept (${file})`);
    }
    return;
  }

  writeFileSync(file, makeFromTemplate());
  ok(`${label}: created from the template (${file})`);
}

/** True for an empty value or a template placeholder such as "<only if ...>". */
const unset = (value) => value === undefined || value === null || String(value).trim() === "" || String(value).trim().startsWith("<");

/** Moves `from` to `to` inside `object` if `to` isn't there yet; always removes `from`. */
function rename(object, from, to) {
  if (!object || !(from in object)) return;
  if (!(to in object)) object[to] = object[from];
  delete object[from];
}

/**
 * Email and SMS (both apps, 21 Oct): no Provider setting any more, SendGrid / Twilio when their keys are set. The
 * templates' "<only if Provider is ...>" placeholders become empty, so nothing is mistaken for a key.
 */
function migrateMessagingProviders(json) {
  if (json.Email) {
    delete json.Email.Provider;
    if (json.Email.SendGrid && unset(json.Email.SendGrid.ApiKey)) json.Email.SendGrid.ApiKey = "";
  }
  if (json.SMS) {
    delete json.SMS.Provider;
    for (const key of Object.keys(json.SMS.Twilio ?? {})) {
      if (unset(json.SMS.Twilio[key])) json.SMS.Twilio[key] = "";
    }
  }
}

/**
 * Takes the "//" notes from the template, so a migrated file explains its settings in today's words, and drops
 * sections left with nothing but a note.
 */
function refreshNotes(json, template) {
  for (const [key, value] of Object.entries(json)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const match = template?.[key];
    refreshNotes(value, match && typeof match === "object" ? match : undefined);
    if (match && typeof match === "object" && "//" in match) value["//"] = match["//"];
    else if (match && typeof match === "object") delete value["//"];
    const keys = Object.keys(value);
    if (keys.length > 0 && keys.every((k) => k === "//")) delete json[key];
  }
}

/** The description model's name in Ollama (Qwen3-VL-8B-Instruct, Apache-2.0). */
const OLLAMA_MODEL = "qwen3-vl:8b";

/**
 * "Suggest a description" uses a real model when Ollama is installed and has the model (ollama pull qwen3-vl:8b,
 * about 6 GB; best on an Apple Silicon Mac with 16 GB or more). Otherwise the stand-in writes a fixed example draft.
 * Never downloads the model itself: it's big, so that's the person's choice.
 */
function useOllamaIfThere(file) {
  if (!existsSync(file)) return;
  const json = JSON.parse(readFileSync(file, "utf8"));
  const describe = json.Media?.Describe ?? {};
  if (!unset(describe.Endpoint)) return;
  const models = output("ollama", ["list"]);
  if (!models) {
    console.log(`"Suggest a description" will use the stand-in. For the real model: install Ollama, then ollama pull ${OLLAMA_MODEL}, and run the setup again.`);
    return;
  }
  if (!models.includes(OLLAMA_MODEL)) {
    console.log(`Ollama is installed. For "Suggest a description" with the real model: ollama pull ${OLLAMA_MODEL} (about 6 GB), then run the setup again.`);
    return;
  }
  json.Media = { ...(json.Media ?? {}), Describe: { ...describe, Endpoint: "http://localhost:11434/v1", Model: OLLAMA_MODEL } };
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  ok(`User secrets: "Suggest a description" uses ${OLLAMA_MODEL} in Ollama`);
}

/** Brings the API's existing user secrets up to the current names (safe to run again). */
function migrateCoreSecrets(file) {
  if (!existsSync(file)) return;
  const before = readFileSync(file, "utf8");
  const json = JSON.parse(before);
  rename(json.ConnectionStrings, "AppDatabase", "BadJockeysDatabase");
  if (json.Messaging) {
    const queues = { ...(json.Queues ?? {}), ...json.Messaging };
    rename(queues, "UserEventsQueue", "UserEvents");
    rename(queues, "MediaEventsQueue", "MediaEvents");
    delete queues.ConnectionStringName;
    delete queues.CreateTables;
    json.Queues = queues;
    delete json.Messaging;
  }
  if (json.Media?.Queue) {
    if (json.Media.Queue.QueueName) json.Queues = { ...(json.Queues ?? {}), MediaProcessing: json.Media.Queue.QueueName };
    delete json.Media.Queue;
  }
  if (json.Media) {
    // The person detector (22 Oct 2026): heads are blurred as a backup for faces.
    const redaction = json.Media.Redaction ?? {};
    if (unset(redaction.PersonModelPath)) redaction.PersonModelPath = personModel();
    // Faces no longer hold uploads for review (22 Oct 2026): move the old default, 0.8, to the new one.
    if (Number(redaction.FaceConfidentAt) === 0.8) redaction.FaceConfidentAt = 0.5;
    json.Media.Redaction = redaction;
    const current = json.Media.SensitiveDetection ?? {};
    for (const key of ["Enabled", "Provider", "InputWidth", "InputHeight", "Mean", "Std", "Output", "SensitiveClasses"]) delete current[key];
    if (unset(current.ModelPath)) current.ModelPath = sensitiveDetection().ModelPath;
    json.Media.SensitiveDetection = current;
  }
  migrateMessagingProviders(json);
  if (json.Captcha) delete json.Captcha.Provider;
  if (json.Screening) {
    // The classifier now runs whenever Endpoint is set: keep it only if it was switched on.
    if (json.Screening.Provider !== "Http") delete json.Screening.Endpoint;
    delete json.Screening.Provider;
  }
  // False is the default everywhere, so it needn't be in the file.
  if (json.Safety?.RequireAgeVerification === false) delete json.Safety.RequireAgeVerification;
  if (json.Safety && Object.keys(json.Safety).length === 0) delete json.Safety;
  if (!json.Notifications?.Push?.PublicKey) {
    // Files made before web push existed: a key pair for this computer.
    json.Notifications = { ...(json.Notifications ?? {}) };
    json.Notifications.Push = { Subject: "mailto:support@badjockeys.com", ...(json.Notifications.Push ?? {}), ...vapidKeys() };
  }
  refreshNotes(json, JSON.parse(readFileSync(join(core, "user-secrets.template.json"), "utf8")));
  const after = `${JSON.stringify(json, null, 2)}\n`;
  if (after !== before) {
    writeFileSync(file, after);
    ok("The API's user secrets: brought up to date (BadJockeysDatabase, Queues, no provider switches)");
  }
}

/**
 * Brings the identity server's existing user secrets up to the current names. Only once that checkout has the
 * new settings itself (its template has BadJockeysDatabase): older identity server code still reads the old names.
 */
function migrateIdentitySecrets(file) {
  if (!existsSync(file)) return;
  if (!readFileSync(join(idsrv, "user-secrets.template.json"), "utf8").includes('"BadJockeysDatabase"')) {
    console.log("The identity server's user secrets: left as they are until bjk-identity-server is updated (git pull)");
    return;
  }
  const before = readFileSync(file, "utf8");
  const json = JSON.parse(before);
  rename(json.ConnectionStrings, "Messaging", "BadJockeysDatabase");
  delete json.Messaging;
  if (json.SignUp) delete json.SignUp.TrustCloudflareCountryHeader;
  migrateMessagingProviders(json);
  const age = json.AgeAssurance;
  if (age && (age.Estimator || age.Document || age.Liveness?.Provider !== undefined)) {
    const yunet = age.Liveness?.YuNet ?? {};
    const { YuNet, Provider, Development, ...livenessRest } = age.Liveness ?? {};
    json.AgeAssurance = {
      ...Object.fromEntries(Object.entries(age).filter(([key]) => !["Liveness", "Estimator", "Document", "Yoti", "Development"].includes(key))),
      Liveness: { ...livenessRest, ...Object.fromEntries(Object.entries(yunet).filter(([key]) => key !== "ModelPath")), ModelPath: unset(yunet.ModelPath) ? livenessModel() : yunet.ModelPath },
      Yoti: age.Yoti ?? { SdkId: "", PrivateKey: "" },
      Development: {
        LivenessPasses: age.Liveness?.Development?.Pass ?? true,
        EstimatedAge: age.Estimator?.Development?.Age ?? 30,
        DocumentAge: age.Document?.Development?.Age ?? 30,
      },
    };
  } else if (age?.Liveness && unset(age.Liveness.ModelPath)) {
    age.Liveness.ModelPath = livenessModel();
  }
  refreshNotes(json, JSON.parse(readFileSync(join(idsrv, "user-secrets.template.json"), "utf8")));
  const after = `${JSON.stringify(json, null, 2)}\n`;
  if (after !== before) {
    writeFileSync(file, after);
    ok("The identity server's user secrets: brought up to date (BadJockeysDatabase, Yoti, no provider switches)");
  }
}

function createConfig() {
  step("Creating your local config files");
  if (!existsSync(join(idsrv, "user-secrets.template.json"))) {
    fail(`bjk-identity-server isn't next to bjk-core (looked in ${idsrv}). Clone it there: see step 2 of docs/local-development.md.`);
  }

  // The local SQL password lives in bjk-core/.env, next to the compose file. It used to be in bjk-identity-server/.env:
  // carry that one over, so existing user secrets keep matching.
  const readPassword = (file) => /^BJK_SQL_PASSWORD=(.+)$/m.exec(readFileSync(file, "utf8"))?.[1]?.trim();
  const envFile = join(core, ".env");
  const oldEnvFile = join(idsrv, ".env");
  let password;
  if (existsSync(envFile)) {
    password = readPassword(envFile);
    if (!password) fail(`${envFile} has no BJK_SQL_PASSWORD line.`);
    console.log("bjk-core/.env: already there, using its SQL password");
  } else {
    const carried = existsSync(oldEnvFile) ? readPassword(oldEnvFile) : undefined;
    password = carried ?? sqlPassword();
    const example = readFileSync(join(core, ".env.example"), "utf8");
    const env = /^BJK_SQL_PASSWORD=/m.test(example)
      ? example.replace(/^BJK_SQL_PASSWORD=.*$/m, `BJK_SQL_PASSWORD=${password}`)
      : `${example.trimEnd()}\nBJK_SQL_PASSWORD=${password}\n`;
    writeIfMissing(envFile, env, carried ? "bjk-core/.env (SQL password carried over from bjk-identity-server/.env)" : "bjk-core/.env");
  }

  // The reports' read-only login, and the Elastic containers' passwords and key.
  reportingPassword();
  const addedElastic = ensureElasticEnv(core);
  if (addedElastic.length) ok(`bjk-core/.env: added ${addedElastic.join(", ")} for Elasticsearch and Kibana`);

  const fromTemplate = (template, edit) => {
    const text = readFileSync(template, "utf8")
      .replaceAll("<BJK_SQL_PASSWORD from your .env>", password)
      .replaceAll("<BJK_SQL_PASSWORD from bjk-identity-server/.env>", password)
      .replaceAll("<BJK_SQL_PASSWORD from bjk-core/.env>", password);
    const json = JSON.parse(text);
    edit(json);
    return `${JSON.stringify(json, null, 2)}\n`;
  };

  ensureUserSecrets(
    IDSRV_SECRETS,
    join(idsrv, "user-secrets.json"),
    () => fromTemplate(join(idsrv, "user-secrets.template.json"), (json) => {
      // Placeholder until you've registered: put your confirmed email here to become the first admin.
      if (json.Admin) json.Admin.BootstrapEmails = [];
      // The real head-turn check, with the model downloaded below.
      if (json.AgeAssurance?.Liveness) json.AgeAssurance.Liveness.ModelPath = livenessModel();
    }),
    "The identity server's user secrets",
  );

  ensureUserSecrets(
    CORE_SECRETS,
    join(core, "user-secrets.json"),
    () => fromTemplate(join(core, "user-secrets.template.json"), (json) => {
      if (json.Reels) json.Reels.ViewerKeySecret = secret();
      json.Notifications = { ...(json.Notifications ?? {}) };
      json.Notifications.Push = { ...(json.Notifications.Push ?? {}), ...vapidKeys() };
      json.Media.Redaction = {
        ...(json.Media.Redaction ?? {}),
        FaceModelPath: join(models, MODELS[0].file),
        PlateModelPath: join(models, MODELS[1].file),
        PersonModelPath: personModel(),
      };
      json.Media.SensitiveDetection = { ...(json.Media.SensitiveDetection ?? {}), ...sensitiveDetection() };
    }),
    "The API's and media worker's user secrets",
  );

  migrateCoreSecrets(CORE_SECRETS);
  migrateIdentitySecrets(IDSRV_SECRETS);
  useOllamaIfThere(CORE_SECRETS);
  useFfmpeg(CORE_SECRETS, [["Media", "Processing"], ["Media", "Describe"]]);
  useFfmpeg(IDSRV_SECRETS, [["AgeAssurance", "Liveness"], ["AgeAssurance", "Yoti"]]);

  // Earlier templates pointed the web app at the API's http address, which redirects to https; Node.js drops the
  // sign-in token on that redirect, so every signed-in call got 401. Move existing files to the https address.
  const webEnv = join(web, ".env.local");
  if (existsSync(webEnv)) {
    const current = readFileSync(webEnv, "utf8");
    if (/^API_BASE_URL=http:\/\/localhost:5100\/?\s*$/m.test(current)) {
      writeFileSync(webEnv, current.replace(/^API_BASE_URL=http:\/\/localhost:5100\/?\s*$/m, "API_BASE_URL=https://localhost:5101"));
      ok("bjk-core/src/web/.env.local: API_BASE_URL moved to https://localhost:5101");
    }
  }

  const webExample = readFileSync(join(web, ".env.local.example"), "utf8");
  writeIfMissing(
    join(web, ".env.local"),
    webExample.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET=${secret()}`),
    "bjk-core/src/web/.env.local",
  );
}

function trustCertificate() {
  step("Trusting the .NET HTTPS development certificate");
  if (!run("dotnet", ["dev-certs", "https", "--trust"])) {
    console.log(colour("33", "Couldn't trust the certificate automatically (on Linux, see the .NET docs for your distribution)."));
  }
  // Node.js doesn't read the operating system's certificate store, so the web app gets a PEM copy.
  const pem = join(homedir(), ".aspnet", "dev-cert.pem");
  mkdirSync(dirname(pem), { recursive: true });
  mustRun("dotnet", ["dev-certs", "https", "--export-path", pem, "--format", "PEM", "--no-password"]);
  ok(`Exported for Node.js to ${pem}`);
}

function startDocker() {
  step("Starting SQL Server, S3Mock, Elasticsearch, Kibana and the OpenTelemetry collector (Docker group bad-jockeys)");
  removeOldGroups();
  if (!startServices(core, { wait: true })) {
    fail(
      "A Docker service didn't start. Run 'docker compose ps' and 'docker compose logs <service>' in bjk-core to see why." +
        (process.platform === "darwin"
          ? " On Apple Silicon, check Rosetta is on in Docker Desktop's settings. Elasticsearch needs about 2 GB of Docker's memory."
          : ""),
    );
  }
  ok("SQL Server is healthy, S3Mock is running, and Kibana is at http://localhost:5601");
  ok(`Sign in to Kibana as elastic, password ${readEnvValue(core, "BJK_ELASTIC_PASSWORD")} (BJK_ELASTIC_PASSWORD in bjk-core/.env)`);
}

async function downloadModels() {
  step("Downloading the blurring models, the CLIP content model and the liveness model (about 140 MB)");
  mkdirSync(models, { recursive: true });
  const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
  for (const model of MODELS) {
    const file = join(models, model.file);
    if (existsSync(file) && sha256(readFileSync(file)) === model.sha256) {
      console.log(`${model.file}: already there`);
      continue;
    }
    const response = await fetch(model.url);
    if (!response.ok) fail(`Downloading ${model.file} failed: HTTP ${response.status}.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (sha256(buffer) !== model.sha256) fail(`${model.file} doesn't match its expected SHA-256, so it wasn't saved.`);
    writeFileSync(file, buffer);
    ok(`${model.file}: downloaded and checked`);
  }
}

function build() {
  step("Restoring and building the .NET apps");
  const hint = "If it's NU1301 or 401, your GitHub sign-in can't read the packages: run gh auth refresh -s read:packages, then this again.";
  mustRun("dotnet", ["build", join(idsrv, "BJK.Idsrv.slnx"), "-v", "quiet", "-nologo"], {}, hint);
  mustRun("dotnet", ["build", join(core, "BJK.Core.slnx"), "-v", "quiet", "-nologo"], {}, hint);

  step("Installing the web app's packages");
  // npm ci installs exactly what package-lock.json says and never rewrites it (npm install can, depending on the npm
  // version, which would leave a stray change in git and stop the setup updating bjk-core).
  mustRun("npm", ["ci", "--no-audit", "--no-fund"], { cwd: web });
}

/** True once the app at `url` answers /health. */
async function healthy(url) {
  try {
    return (await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/**
 * Adds the example users and posts. The identity server and the API create and update their databases when they
 * start, so any that aren't already running are started for a moment (from the Debug build) and stopped again.
 * A problem here only warns: the rest of the setup is still done.
 */
/** A free TCP port on this computer, for starting an app briefly without clashing with anything. */
function freePort() {
  return new Promise((done, failed) => {
    const server = createServer();
    server.once("error", failed);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** The last lines of a log file, indented, for an error message. */
function tail(file, lines = 25) {
  try {
    return readFileSync(file, "utf8").trimEnd().split(/\r?\n/).slice(-lines).map((l) => `    ${l}`).join("\n");
  } catch {
    return "    (no output)";
  }
}

async function exampleData() {
  step("Adding example users and posts");
  const api = join(core, "src", "BJK.Core.Api");
  const logs = join(core, ".local", "logs");
  mkdirSync(logs, { recursive: true });
  // `running` is where the app answers when you run it normally; if it's up there, its database already exists.
  const apps = [
    { name: "identity server", project: join(idsrv, "src", "BJK.Idsrv.Host"), dll: "BJK.Idsrv.Host.dll", running: "http://localhost:5000", log: "setup-identity-server.log" },
    { name: "API", project: api, dll: "BJK.Core.Api.dll", running: "http://localhost:5100", log: "setup-api.log" },
  ];
  const started = [];
  try {
    for (const app of apps) {
      if (await healthy(app.running)) continue;
      // A free port of its own, so it can't clash with the app already running or anything else (on a Mac,
      // AirPlay Receiver usually holds port 5000).
      const url = `http://127.0.0.1:${await freePort()}`;
      const logFile = join(logs, app.log);
      const log = createWriteStream(logFile);
      console.log(`Starting the ${app.name} for a moment, so its database is up to date...`);
      const child = spawn("dotnet", [join(app.project, "bin", "Debug", "net10.0", app.dll)], {
        cwd: app.project,
        env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Development", ASPNETCORE_URLS: url },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.pipe(log);
      child.stderr.pipe(log);
      started.push(child);
      let up = false;
      for (let i = 0; i < 90 && !up && child.exitCode === null; i++) {
        await new Promise((done) => setTimeout(done, 2000));
        up = await healthy(url);
      }
      if (!up) {
        const why = child.exitCode === null ? "didn't answer within 3 minutes" : `stopped (exit code ${child.exitCode})`;
        await new Promise((done) => setTimeout(done, 500));
        throw new Error(
          `The ${app.name} ${why}, so its database may not be ready. Its last output (full log: ${logFile}):\n${tail(logFile)}`,
        );
      }
      ok(`The ${app.name} started and its database is up to date.`);
    }

    process.env.BJK_FFMPEG = (ffmpegTools ??= findFfmpeg()).ffmpeg;
    await seedExampleData();
    seedSafetyTestData();

    const owner = ownerId();
    if (owner) {
      const secrets = JSON.parse(readFileSync(CORE_SECRETS, "utf8"));
      secrets.Plans = { ...(secrets.Plans ?? {}), Overrides: { ...(secrets.Plans?.Overrides ?? {}), [owner]: OWNER_PLAN } };
      writeFileSync(CORE_SECRETS, `${JSON.stringify(secrets, null, 2)}\n`);
      ok(`${OWNER_EMAIL} has ${OWNER_PLAN} on this computer (Plans:Overrides in the API's user secrets).`);
    } else {
      console.log(
        `${OWNER_EMAIL} hasn't signed up here yet. Sign up in the web app, then run the setup again: it gives the ` +
          `account ${OWNER_PLAN} and a passenger tag to approve.`,
      );
    }
  } catch (error) {
    console.warn(colour("33", `Example data wasn't added: ${error.message}\nRun the setup again once that's fixed.`));
  } finally {
    for (const child of started) child.kill();
  }
}

function reporting() {
  step("Setting up the reports");
  try {
    applyReporting();
    ok("Reporting views and the read-only bjk_reporting login are ready (Power BI reads them when deployed).");
  } catch (error) {
    console.warn(
      colour("33", `The reporting views weren't applied: ${error.message}\nRun node scripts/sql/reporting/apply.mjs once the API and identity server have started.`),
    );
  }
}

if (configOnly) {
  createConfig();
} else {
  checkTools();
  ensurePackageCredentials();
  createConfig();
  trustCertificate();
  startDocker();
  await downloadModels();
  build();
  await exampleData();
  reporting();
  safetyCoverage();
  console.log(
    `\n${colour("1;32", "Setup complete.")} In VS Code: Terminal > Run Task... > "Run Bad Jockeys", then open http://localhost:3000`,
  );
}
