import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { WORKSPACE_PUBLISH_ORDER } from "./release-config";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const OUTPUT_ROOT = resolve(REPO_ROOT, "dist/release-packages");

async function main() {
  await rm(OUTPUT_ROOT, { force: true, recursive: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const tarballPaths: string[] = [];

  for (const packageName of WORKSPACE_PUBLISH_ORDER) {
    const packageDir = join(OUTPUT_ROOT, sanitizePackageName(packageName));
    await mkdir(packageDir, { recursive: true });

    runCommand("pnpm", [
      "--filter",
      packageName,
      "pack",
      "--pack-destination",
      packageDir,
    ]);

    const tarballPath = await getSingleTarballPath(packageDir, packageName);
    tarballPaths.push(tarballPath);
  }

  console.log("Packed workspace tarballs:");
  for (const tarballPath of tarballPaths) {
    console.log(tarballPath);
  }
}

async function getSingleTarballPath(packageDir: string, packageName: string) {
  const entries = await readdir(packageDir, { withFileTypes: true });
  const tarballs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => join(packageDir, entry.name));

  if (tarballs.length !== 1) {
    throw new Error(
      `Expected exactly one .tgz for ${packageName} in ${packageDir}, found ${tarballs.length}.`,
    );
  }

  return tarballs[0];
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    cwd: REPO_ROOT,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status ?? 1}: ${command} ${args.join(" ")}`,
    );
  }
}

function sanitizePackageName(packageName: string) {
  return packageName.replace(/[@/]/g, "_");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Workspace pack failed: ${message}`);
  process.exit(1);
});