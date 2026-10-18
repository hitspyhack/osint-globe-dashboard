import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiValue = process.env.CAPACITOR_API_URL?.trim();

function fail(message) {
  console.error(`\n[iOS build] ${message}\n`);
  process.exit(1);
}

if (!apiValue) {
  fail(
    "Set CAPACITOR_API_URL to the HTTPS origin serving this project's Next.js /api routes. " +
      "Example: CAPACITOR_API_URL=https://osint.example.com npm run ios:sync"
  );
}

let apiUrl;
try {
  apiUrl = new URL(apiValue);
} catch {
  fail(`CAPACITOR_API_URL is not a valid URL: ${apiValue}`);
}

if (apiUrl.protocol !== "https:") {
  fail("TestFlight builds require an HTTPS CAPACITOR_API_URL.");
}
if (apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash || apiUrl.pathname !== "/") {
  fail("CAPACITOR_API_URL must be a bare origin (scheme + host), with no path, credentials, query, or fragment.");
}

const env = { ...process.env, CAPACITOR_API_URL: apiUrl.origin };
const nextBuild = spawnSync(
  process.execPath,
  [path.join(projectRoot, "scripts", "build-capacitor-web.mjs")],
  { cwd: projectRoot, env, stdio: "inherit" }
);
if (nextBuild.status !== 0) process.exit(nextBuild.status ?? 1);

const platformCommand = fs.existsSync(path.join(projectRoot, "ios")) ? "sync" : "add";
const capacitor = spawnSync(
  process.execPath,
  [path.join(projectRoot, "node_modules", "@capacitor", "cli", "bin", "capacitor"), platformCommand, "ios"],
  { cwd: projectRoot, env, stdio: "inherit" }
);
process.exit(capacitor.status ?? 1);
