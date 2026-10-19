// Runs the standalone build the way the container does (see Dockerfile): copy the static files next to server.js,
// then start it. `next build` must have run first.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const standalone = `${root}.next/standalone`;
if (!existsSync(`${standalone}/server.js`)) {
  console.error("No standalone build found. Run `npm run build` first.");
  process.exit(1);
}
cpSync(`${root}.next/static`, `${standalone}/.next/static`, { recursive: true });
if (existsSync(`${root}public`)) {
  cpSync(`${root}public`, `${standalone}/public`, { recursive: true });
}
await import(`${standalone}/server.js`);
