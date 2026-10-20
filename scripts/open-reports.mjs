#!/usr/bin/env node
// Opens the reports (Grafana, http://localhost:3300) in your browser once Grafana answers, so they appear next to
// the web app when you press F5 ("Bad Jockeys") or run the task "Run Bad Jockeys". start-docker.mjs starts this in
// the background with --open-reports; it gives up quietly after 2 minutes. Uses only Node.js built-ins.

import { spawn } from "node:child_process";

const URL = "http://localhost:3300";
const TIMEOUT_SECONDS = 120;

async function grafanaAnswers() {
  try {
    return (await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

function openInBrowser(url) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true }).unref();
}

for (let waited = 0; waited < TIMEOUT_SECONDS; waited += 2) {
  if (await grafanaAnswers()) {
    openInBrowser(URL);
    process.exit(0);
  }
  await new Promise((done) => setTimeout(done, 2000));
}
