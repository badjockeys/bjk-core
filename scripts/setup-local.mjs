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
//      (bjk-identity-server/.env and user-secrets.json, bjk-core/user-secrets.json, src/web/.env.local);
//      files that already exist are left alone
//   3. trusts the .NET HTTPS development certificate and exports it for Node.js
//   4. starts SQL Server (bjk-identity-server) and S3Mock (bjk-core) in Docker
//   5. loads the .NET user secrets for the identity server and the API (the media worker shares the API's)
//   6. downloads the face and number plate blurring models into bjk-core/.local/models
//   7. builds the .NET apps and installs the web app's packages
//
// Needs the tools installed and bjk-identity-server cloned next to bjk-core: setup.ps1 (Windows) and setup.sh
// (macOS) in the repo root do both, then run this. Uses only Node.js built-ins.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const core = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const idsrv = resolve(core, "..", "bjk-identity-server");
const web = join(core, "src", "web");
const models = join(core, ".local", "models");
const isWindows = process.platform === "win32";
const configOnly = process.argv.includes("--config-only");

const MODELS = [
  {
    file: "face_detection_yunet_2026may.onnx",
    path: "face_detection_yunet/face_detection_yunet_2026may.onnx",
    sha256: "ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0",
  },
  {
    file: "license_plate_detection_lpd_yunet_2023mar.onnx",
    path: "license_plate_detection_yunet/license_plate_detection_lpd_yunet_2023mar.onnx",
    sha256: "6d4978a7b6d25514d5e24811b82bfb511d166bdd8ca3b03aa63c1623d4d039c7",
  },
];
// OpenCV Zoo pinned to one commit; keep in step with pipelines/scripts/download-redaction-models.sh.
const MODEL_BASE =
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models";

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

function checkTools() {
  step("Checking tools");
  const missing = [];
  const dotnet = output("dotnet", ["--version"]);
  if (!dotnet) missing.push(".NET SDK 10 (https://dotnet.microsoft.com/download)");
  else if (Number(dotnet.split(".")[0]) < 10) missing.push(`.NET SDK 10 or later (you have ${dotnet})`);
  const node = process.versions.node;
  if (Number(node.split(".")[0]) < 24) console.log(colour("33", `Node.js ${node}: the web app expects 24 or later.`));
  if (!output("docker", ["--version"])) missing.push("Docker Desktop (https://www.docker.com/products/docker-desktop)");
  const ffmpeg = output("ffmpeg", ["-version"]);
  if (!ffmpeg) missing.push(isWindows ? "ffmpeg (winget install Gyan.FFmpeg)" : "ffmpeg (brew install ffmpeg)");
  if (missing.length) fail(`Missing: ${missing.join("; ")}. See step 1 of docs/local-development.md.`);
  if (!output("docker", ["info"])) fail("Docker Desktop isn't running. Start it, then run this again.");
  ok(`.NET ${dotnet}, Node.js ${node}, ${ffmpeg.split("\n")[0].split(" ").slice(0, 3).join(" ")}, Docker running`);
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
      "No GitHub access for the private BJK.Modules packages. Either run the full setup (setup.ps1 on Windows,\n" +
        "setup.sh on a Mac), or sign in with the GitHub CLI and run this again:\n" +
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

function createConfig() {
  step("Creating your local config files");
  if (!existsSync(join(idsrv, ".env.example"))) {
    fail(`bjk-identity-server isn't next to bjk-core (looked in ${idsrv}). Clone it there: see step 2 of docs/local-development.md.`);
  }

  // The SQL password lives in bjk-identity-server/.env; reuse it if that file already exists.
  const envFile = join(idsrv, ".env");
  let password;
  if (existsSync(envFile)) {
    password = /^BJK_SQL_PASSWORD=(.+)$/m.exec(readFileSync(envFile, "utf8"))?.[1]?.trim();
    if (!password) fail(`${envFile} has no BJK_SQL_PASSWORD line.`);
    console.log("bjk-identity-server/.env: already there, using its SQL password");
  } else {
    password = sqlPassword();
    const example = readFileSync(join(idsrv, ".env.example"), "utf8");
    const env = /^BJK_SQL_PASSWORD=/m.test(example)
      ? example.replace(/^BJK_SQL_PASSWORD=.*$/m, `BJK_SQL_PASSWORD=${password}`)
      : `${example.trimEnd()}\nBJK_SQL_PASSWORD=${password}\n`;
    writeIfMissing(envFile, env, "bjk-identity-server/.env");
  }

  const fromTemplate = (template, edit) => {
    const text = readFileSync(template, "utf8")
      .replaceAll("<BJK_SQL_PASSWORD from your .env>", password)
      .replaceAll("<BJK_SQL_PASSWORD from bjk-identity-server/.env>", password);
    const json = JSON.parse(text);
    edit(json);
    return `${JSON.stringify(json, null, 2)}\n`;
  };

  writeIfMissing(
    join(idsrv, "user-secrets.json"),
    fromTemplate(join(idsrv, "user-secrets.template.json"), (json) => {
      // Placeholder until you've registered: put your confirmed email here to become the first admin.
      if (json.Admin) json.Admin.BootstrapEmails = [];
    }),
    "bjk-identity-server/user-secrets.json",
  );

  writeIfMissing(
    join(core, "user-secrets.json"),
    fromTemplate(join(core, "user-secrets.template.json"), (json) => {
      if (json.Reels) json.Reels.ViewerKeySecret = secret();
      json.Media.Redaction = {
        ...(json.Media.Redaction ?? {}),
        FaceModelPath: join(models, MODELS[0].file),
        PlateModelPath: join(models, MODELS[1].file),
      };
    }),
    "bjk-core/user-secrets.json",
  );

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

async function startDocker() {
  step("Starting SQL Server (bjk-identity-server)");
  mustRun("docker", ["compose", "up", "-d"], { cwd: idsrv });
  process.stdout.write("Waiting for SQL Server to be healthy");
  let status = "starting";
  for (let i = 0; i < 40 && status !== "healthy"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    status = output("docker", ["inspect", "-f", "{{.State.Health.Status}}", "bjk-sql"]) ?? "starting";
    process.stdout.write(".");
  }
  console.log(` ${status}`);
  if (status !== "healthy") {
    fail(
      "SQL Server didn't become healthy. Run 'docker compose logs sql' in bjk-identity-server." +
        (process.platform === "darwin" ? " On Apple Silicon, turn on Rosetta in Docker Desktop's settings." : ""),
    );
  }

  step("Starting S3Mock file storage (bjk-core)");
  mustRun("docker", ["compose", "up", "-d"], { cwd: core });
}

function loadSecrets() {
  step("Loading user secrets");
  for (const [project, file] of [
    [join(idsrv, "src", "BJK.Idsrv.Host"), join(idsrv, "user-secrets.json")],
    [join(core, "src", "BJK.Core.Api"), join(core, "user-secrets.json")],
  ]) {
    run("dotnet", ["user-secrets", "clear", "--project", project], { quiet: true });
    mustRun("dotnet", ["user-secrets", "set", "--project", project], { input: readFileSync(file, "utf8") });
  }
}

async function downloadModels() {
  step("Downloading the face and number plate blurring models");
  mkdirSync(models, { recursive: true });
  const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
  for (const model of MODELS) {
    const file = join(models, model.file);
    if (existsSync(file) && sha256(readFileSync(file)) === model.sha256) {
      console.log(`${model.file}: already there`);
      continue;
    }
    const response = await fetch(`${MODEL_BASE}/${model.path}`);
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
  mustRun("npm", ["install", "--no-audit", "--no-fund"], { cwd: web });
}

if (configOnly) {
  createConfig();
} else {
  checkTools();
  ensurePackageCredentials();
  createConfig();
  trustCertificate();
  await startDocker();
  loadSecrets();
  await downloadModels();
  build();
  console.log(
    `\n${colour("1;32", "Setup complete.")} In VS Code: Terminal > Run Task... > "Run Bad Jockeys", then open http://localhost:3000`,
  );
}
