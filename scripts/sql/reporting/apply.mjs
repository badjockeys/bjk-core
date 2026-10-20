// Creates (or updates) the reporting views Grafana reads, in both databases, and the read-only bjk_reporting login,
// in the local SQL Server container. The setup runs it; run it yourself after pulling changes to the views:
//
//   node scripts/sql/reporting/apply.mjs
//
// The identity server and the API must each have started once, so both databases (and the queue tables) exist.
// The login's password is BJK_REPORTING_PASSWORD in bjk-core/.env (added there if missing); Grafana reads it from
// the same file.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const core = resolve(here, "..", "..", "..");
const envFile = join(core, ".env");
const SQL_CONTAINER = "bad-jockeys-sql-server";

function readEnv(name) {
  if (!existsSync(envFile)) return null;
  return new RegExp(`^${name}=(.+)$`, "m").exec(readFileSync(envFile, "utf8"))?.[1]?.trim() ?? null;
}

/** BJK_REPORTING_PASSWORD from .env, created there first if it isn't set. */
export function reportingPassword() {
  let password = readEnv("BJK_REPORTING_PASSWORD");
  if (!password) {
    // Letters and digits only, so it needs no escaping in SQL, YAML or the shell.
    password = `Rpt${randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "")}9a`;
    const current = readFileSync(envFile, "utf8");
    if (/^BJK_REPORTING_PASSWORD=[ \t\r]*$/m.test(current)) {
      writeFileSync(envFile, current.replace(/^BJK_REPORTING_PASSWORD=[ \t\r]*$/m, `BJK_REPORTING_PASSWORD=${password}`));
    } else {
      appendFileSync(envFile, `${current.endsWith("\n") ? "" : "\n"}BJK_REPORTING_PASSWORD=${password}\n`);
    }
  }
  return password;
}

function sqlcmd(file, database, variables = {}) {
  const sa = readEnv("BJK_SQL_PASSWORD");
  if (!sa) throw new Error(`${envFile} has no BJK_SQL_PASSWORD line.`);
  const vars = Object.entries(variables).flatMap(([k, v]) => ["-v", `${k}=${v}`]);
  execFileSync(
    "docker",
    [
      "exec", "-i", SQL_CONTAINER, "/opt/mssql-tools18/bin/sqlcmd",
      "-S", "localhost", "-U", "sa", "-P", sa, "-C", "-b", "-I", "-d", database, ...vars,
    ],
    { input: readFileSync(join(here, file), "utf8"), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

/** Applies the views and the login. Throws with sqlcmd's message if something fails. */
export function applyReporting() {
  try {
    sqlcmd("idsrv.sql", "idsrv");
    sqlcmd("badjockeys.sql", "badjockeys");
    sqlcmd("login.sql", "master", { ReportingPassword: reportingPassword() });
  } catch (error) {
    throw new Error((error.stdout || "") + (error.stderr || error.message));
  }
}

// Run on its own (not imported by the setup).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    applyReporting();
    console.log("Reporting views and the bjk_reporting login are up to date. Grafana: http://localhost:3300");
  } catch (error) {
    console.error(`The reporting views couldn't be applied:\n${error.message}`);
    process.exit(1);
  }
}
