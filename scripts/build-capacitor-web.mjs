import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiOrigin = process.env.CAPACITOR_API_URL?.trim();
const outputDirectory = path.join(projectRoot, "www");
const excludedRoots = new Set([
  ".git",
  ".next",
  ".capacitor-build",
  "node_modules",
  "ios",
  "www",
  "out",
  "build",
  "coverage",
  "target",
  ".vercel",
]);

if (!apiOrigin) {
  console.error("CAPACITOR_API_URL is required to build the packaged iOS web assets.");
  process.exit(1);
}

const parsedOrigin = new URL(apiOrigin);
if (parsedOrigin.protocol !== "https:") {
  console.error("The packaged iOS app requires an HTTPS API origin.");
  process.exit(1);
}

const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "ogd-capacitor-build-"));
const temporaryProject = path.join(temporaryParent, "project");
fs.mkdirSync(temporaryProject, { recursive: true });
fs.cpSync(projectRoot, temporaryProject, {
  recursive: true,
  filter(sourcePath) {
    const relativePath = path.relative(projectRoot, sourcePath);
    if (!relativePath) return true;
    const root = relativePath.split(path.sep)[0];
    if (excludedRoots.has(root)) return false;
    if (root === ".env" || (root.startsWith(".env.") && root !== ".env.example")) return false;
    return true;
  },
});

// The iOS bundle contains only the client. Dynamic Next.js API routes and
// middleware remain on the hosted Next.js backend and are reached via CORS.
fs.rmSync(path.join(temporaryProject, "app", "api"), { recursive: true, force: true });
fs.rmSync(path.join(temporaryProject, "middleware.ts"), { force: true });
fs.symlinkSync(path.join(projectRoot, "node_modules"), path.join(temporaryProject, "node_modules"), "dir");

const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: temporaryProject,
  stdio: "inherit",
  env: {
    ...process.env,
    CAPACITOR_STATIC_EXPORT: "1",
    NEXT_PUBLIC_API_BASE_URL: parsedOrigin.origin,
  },
});

if (result.status !== 0) {
  fs.rmSync(temporaryParent, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const staticOutput = path.join(temporaryProject, "out");
if (!fs.existsSync(path.join(staticOutput, "index.html"))) {
  fs.rmSync(temporaryParent, { recursive: true, force: true });
  console.error("Next.js did not produce out/index.html for the Capacitor bundle.");
  process.exit(1);
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.cpSync(staticOutput, outputDirectory, { recursive: true });
fs.rmSync(temporaryParent, { recursive: true, force: true });
console.log(`Packaged static iOS web assets into ${path.relative(projectRoot, outputDirectory)}.`);
console.log(`API requests will use ${parsedOrigin.origin}.`);
