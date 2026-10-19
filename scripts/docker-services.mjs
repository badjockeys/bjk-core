// Shared by setup-local.mjs and start-docker.mjs: starts the "bad-jockeys" Docker group (SQL Server and S3Mock, from
// bjk-core's docker-compose.yml), first clearing away the two groups it replaced. Uses only Node.js built-ins.

import { spawnSync } from "node:child_process";

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

/** docker compose up -d --wait in bjk-core: returns true once SQL Server is healthy and S3Mock is running. */
export function startServices(core) {
  return spawnSync("docker", ["compose", "up", "-d", "--wait"], { cwd: core, stdio: "inherit" }).status === 0;
}
