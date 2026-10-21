// Shared by setup-local.mjs and start-docker.mjs: starts the "bad-jockeys" Docker group (bjk-core's
// docker-compose.yml: SQL Server, S3Mock, and Elasticsearch, Kibana and the OpenTelemetry collector), first clearing
// away the groups and containers it replaced. Uses only Node.js built-ins.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

/** The groups that used to hold SQL Server (bjk-identity-server's compose file) and S3Mock (bjk-core's, unnamed). */
const OLD_GROUPS = [
  { project: "bjk-identity-server", volume: "bjk-identity-server_bjk-sql-data" },
  { project: "bjk-core", volume: "bjk-core_s3-data" },
];

const quiet = (args) => spawnSync("docker", args, { encoding: "utf8" });

/**
 * Removes the containers of the old groups, which would otherwise hold ports 1433 and 9090. Their data volumes are
 * kept (nothing is deleted that can't be got back); the message says how to remove them. Does nothing once they're
 * gone, so it's safe on every run.
 */
export function removeOldGroups() {
  const leftovers = [];
  let removed = false;
  for (const { project, volume } of OLD_GROUPS) {
    const ids = quiet(["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`]).stdout?.trim();
    if (ids) {
      console.log(`Removing Docker's old "${project}" group; SQL Server and S3Mock now live in "bad-jockeys".`);
      quiet(["rm", "-f", ...ids.split(/\s+/)]);
      quiet(["network", "rm", `${project}_default`]);
      removed = true;
    }
    if (quiet(["volume", "inspect", volume]).status === 0) leftovers.push(volume);
  }
  if (removed && leftovers.length) {
    console.log(
      `The old groups' data is still on disk. Once you're happy with the new setup, free the space with:\n` +
        `  docker volume rm ${leftovers.join(" ")}`,
    );
  }
}

/** The services the apps can't start without; the Elastic ones only receive logs, so the apps don't wait for them. */
const ESSENTIAL = ["sql", "s3"];

/** Grafana's containers, replaced by Elastic on 21 Oct 2026. Their volume (grafana-data) is left; it's tiny. */
const REPLACED = ["bad-jockeys-otel", "bad-jockeys-grafana"];

function removeReplaced() {
  for (const name of REPLACED) {
    if (quiet(["container", "inspect", name]).status === 0) {
      console.log(`Removing the old ${name} container (logs and traces now go to Elastic).`);
      quiet(["rm", "-f", name]);
    }
  }
}

/**
 * Starts the whole group. With wait (the setup), returns true once everything is ready, Kibana included. Without it
 * (F5 and "Run Bad Jockeys"), returns true once SQL Server is healthy and S3Mock is running, and starts the Elastic
 * containers in the background (their output in .local/elastic-start.log), so the apps don't wait a minute for Kibana.
 */
export function startServices(core, { wait = false } = {}) {
  removeReplaced();
  const compose = (args, options) => spawnSync("docker", ["compose", ...args], { cwd: core, stdio: "inherit", ...options });
  if (wait) return compose(["up", "-d", "--wait", "--remove-orphans"]).status === 0;
  if (compose(["up", "-d", "--wait", ...ESSENTIAL]).status !== 0) return false;
  mkdirSync(join(core, ".local"), { recursive: true });
  const log = openSync(join(core, ".local", "elastic-start.log"), "w");
  spawn("docker", ["compose", "up", "-d", "--remove-orphans"], { cwd: core, stdio: ["ignore", log, log], detached: true }).unref();
  return true;
}
