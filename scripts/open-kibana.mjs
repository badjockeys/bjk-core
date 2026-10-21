#!/usr/bin/env node
// Opens Kibana's service view (http://localhost:5601) in your browser once Kibana answers, so logs and traces appear
// next to the web app when you press F5 ("Bad Jockeys") or run the task "Run Bad Jockeys". start-docker.mjs starts
// this in the background with --open-kibana; it gives up quietly after 4 minutes (Kibana's first start is slow).
// Uses only Node.js built-ins.

import { spawn } from "node:child_process";

const BASE = "http://localhost:5601";
const PAGE = `${BASE}/app/apm/services`;
const TIMEOUT_SECONDS = 240;

async function kibanaAnswers() {
  try {
    const response = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(2000) });
    return response.status === 200 || response.status === 401;
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

for (let waited = 0; waited < TIMEOUT_SECONDS; waited += 3) {
  if (await kibanaAnswers()) {
    openInBrowser(PAGE);
    process.exit(0);
  }
  await new Promise((done) => setTimeout(done, 3000));
}
