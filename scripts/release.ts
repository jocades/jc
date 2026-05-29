import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type JsonObject = Record<string, unknown>;

const version = process.argv[2];
const shouldPush = process.argv.includes("--push");

if (!version) {
  console.error("Usage: bun run release <version> [--push]");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version "${version}". Use a semver-like value such as 0.1.1 or 1.0.0-beta.1.`);
  process.exit(1);
}

const rootDir = process.cwd();
const packageJsonPath = resolve(rootDir, "package.json");
const tauriConfigPath = resolve(rootDir, "src-tauri", "tauri.conf.json");

function runGit(args: string[]): string {
  return execFileSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();
}

function readJson(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function writeJson(path: string, data: JsonObject) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

try {
  const status = runGit(["status", "--short"]);
  if (status) {
    console.error("Git working tree is not clean. Commit or stash your changes before creating a release.");
    process.exit(1);
  }

  const existingTag = runGit(["tag", "--list", `v${version}`]);
  if (existingTag) {
    console.error(`Tag v${version} already exists.`);
    process.exit(1);
  }

  const packageJson = readJson(packageJsonPath);
  const tauriConfig = readJson(tauriConfigPath);

  packageJson.version = version;
  tauriConfig.version = version;

  writeJson(packageJsonPath, packageJson);
  writeJson(tauriConfigPath, tauriConfig);

  runGit(["add", "package.json", "src-tauri/tauri.conf.json"]);
  runGit(["commit", "-m", `release: v${version}`]);
  runGit(["tag", `v${version}`]);

  if (shouldPush) {
    runGit(["push", "origin", "HEAD"]);
    runGit(["push", "origin", `v${version}`]);
  }

  console.log(`Created release commit and tag for v${version}.`);
  if (!shouldPush) {
    console.log("Push them with:");
    console.log("  git push origin HEAD");
    console.log(`  git push origin v${version}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
