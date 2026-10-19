#!/usr/bin/env node
// Waits until the apps another app depends on are answering, so nothing starts before what it needs.
//
//   node scripts/wait-for-apps.mjs identity api    before the web app (it calls both)
//   node scripts/wait-for-apps.mjs api             before the media worker (the API creates its database and queues)
//
// Polls each app's /health on its plain-http address every second. Any HTTP answer counts as up, including the
// redirect to https, so the development certificate doesn't matter here. Gives up after 5 minutes with a message
// saying which app to start. Uses only Node.js built-ins.

const APPS = {
  identity: { name: "Identity server", url: "http://localhost:5000/health", start: '"Identity server"' },
  api: { name: "API", url: "http://localhost:5100/health", start: '"API"' },
};
const TIMEOUT_SECONDS = 300;

const wanted = process.argv.slice(2);
if (!wanted.length || wanted.some((key) => !APPS[key])) {
  console.error(`Usage: node scripts/wait-for-apps.mjs <${Object.keys(APPS).join("|")}>...`);
  process.exit(2);
}

async function answers(url) {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

const pending = new Set(wanted);
console.log(`Waiting for: ${[...pending].map((key) => APPS[key].name).join(", ")}`);
const started = Date.now();
while (pending.size) {
  for (const key of [...pending]) {
    if (await answers(APPS[key].url)) {
      console.log(`${APPS[key].name} is up (${Math.round((Date.now() - started) / 1000)}s)`);
      pending.delete(key);
    }
  }
  if (!pending.size) break;
  if (Date.now() - started > TIMEOUT_SECONDS * 1000) {
    const missing = [...pending].map((key) => APPS[key]);
    console.error(
      `\n${missing.map((app) => app.name).join(" and ")} didn't answer within ${TIMEOUT_SECONDS / 60} minutes.\n` +
        `Start ${missing.map((app) => app.start).join(" and ")} from Run and Debug (or use "Bad Jockeys" to start ` +
        `everything), or check ${missing.length > 1 ? "their" : "its"} output for an error.`,
    );
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
