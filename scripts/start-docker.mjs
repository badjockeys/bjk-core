#!/usr/bin/env node
// Makes sure SQL Server and S3Mock are running before the apps start, on macOS, Windows or Linux.
//
//   node scripts/start-docker.mjs
//
// If Docker Desktop is closed, it opens it and waits (up to 3 minutes) for it to be ready, then starts both
// containers with docker compose and waits until they're up (SQL Server until it's healthy). When everything is
// already running it takes a second or two. If it can't get there, it says why in plain words and exits non-zero,
// so VS Code stops before launching apps that would only fail on their database connection.
// Uses only Node.js built-ins.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const core = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const idsrv = resolve(core, "..", "bjk-identity-server");
const WAIT_SECONDS = 180;

function fail(text) {
  console.error(`\n${text}\n`);
  process.exit(1);
}

const dockerAnswers = () => spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

function openDockerDesktop() {
  if (process.platform === "darwin") {
    return spawnSync("open", ["-a", "Docker"], { stdio: "ignore" }).status === 0;
  }
  if (process.platform === "win32") {
    const exe = join(process.env.ProgramFiles ?? "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe");
    if (!existsSync(exe)) return false;
    spawnSync("cmd", ["/c", "start", "", exe], { stdio: "ignore" });
    return true;
  }
  return false; // Linux: the Docker service is started by the system, not an app.
}

async function ensureDocker() {
  if (spawnSync("docker", ["--version"], { stdio: "ignore" }).error) {
    fail("Docker isn't installed. Run the setup (setup.sh on a Mac, setup.ps1 on Windows), then try again.");
  }
  if (dockerAnswers()) return;

  console.log("Docker isn't running, so starting Docker Desktop...");
  if (!openDockerDesktop()) {
    fail(
      process.platform === "linux"
        ? "Docker isn't running. Start it (for example: sudo systemctl start docker), then try again."
        : "Docker isn't running and Docker Desktop couldn't be opened. Open it yourself, wait until it says it's running, then try again.",
    );
  }
  process.stdout.write("Waiting for Docker");
  for (let waited = 0; waited < WAIT_SECONDS; waited += 3) {
    await new Promise((r) => setTimeout(r, 3000));
    if (dockerAnswers()) {
      console.log(" ready");
      return;
    }
    process.stdout.write(".");
  }
  console.log();
  fail(
    "Docker Desktop didn't become ready within 3 minutes. Check its window (it may be updating or asking you to\n" +
      "accept its terms), wait until it says it's running, then try again.",
  );
}

function composeUp(dir, what) {
  if (!existsSync(join(dir, "docker-compose.yml"))) fail(`Can't find ${what}'s docker-compose.yml in ${dir}.`);
  const result = spawnSync("docker", ["compose", "up", "-d", "--wait"], { cwd: dir, stdio: "inherit" });
  if (result.status !== 0) {
    fail(`${what} didn't start. Run 'docker compose logs' in ${dir} to see why.`);
  }
}

await ensureDocker();
composeUp(idsrv, "SQL Server (bjk-identity-server)");
composeUp(core, "S3Mock file storage (bjk-core)");
console.log("SQL Server and S3Mock are running.");
