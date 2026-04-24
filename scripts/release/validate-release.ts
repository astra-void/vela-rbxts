import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PUBLIC_RELEASE_PACKAGES,
  RELEASE_TAG_PATTERN,
} from "./release-config";

type PackageJson = {
  name?: unknown;
  version?: unknown;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

function main() {
  const releaseTag = resolveReleaseTag();

  if (!RELEASE_TAG_PATTERN.test(releaseTag)) {
    fail(
      `Invalid release tag "${releaseTag}". Expected format vX.Y.Z or vX.Y.Z-prerelease.`,
    );
  }

  const expectedVersion = releaseTag.slice(1);
  const discoveredVersions = new Set<string>();

  for (const pkg of PUBLIC_RELEASE_PACKAGES) {
    const manifestPath = resolve(REPO_ROOT, pkg.path, "package.json");
    const manifest = readJsonFile(manifestPath);
    const packageName = readStringField(manifest, "name", manifestPath);
    const version = readStringField(manifest, "version", manifestPath);

    if (packageName !== pkg.packageName) {
      fail(
        `Package name mismatch in ${manifestPath}. Expected "${pkg.packageName}" but found "${packageName}".`,
      );
    }

    discoveredVersions.add(version);
  }

  if (discoveredVersions.size !== 1) {
    fail(
      `All public release packages must share exactly one version. Found: ${[...discoveredVersions].join(
        ", ",
      )}.`,
    );
  }

  const [workspaceVersion] = discoveredVersions;
  if (workspaceVersion !== expectedVersion) {
    fail(
      `Release tag version mismatch. Tag ${releaseTag} expects "${expectedVersion}", but public packages are "${workspaceVersion}".`,
    );
  }

  ensureHeadInOriginMain();

  console.log(
    `Release validation passed for ${releaseTag} with version ${workspaceVersion}.`,
  );
}

function resolveReleaseTag() {
  const releaseTag =
    process.env.RELEASE_TAG?.trim() ||
    process.env.GITHUB_REF_NAME?.trim() ||
    process.argv[2]?.trim();

  if (!releaseTag) {
    fail(
      "Missing release tag. Provide RELEASE_TAG, GITHUB_REF_NAME, or the first CLI argument.",
    );
  }

  return releaseTag;
}

function ensureHeadInOriginMain() {
  const refCheck = spawnSync("git", ["rev-parse", "--verify", "origin/main"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (refCheck.error) {
    fail(`Failed to verify origin/main: ${refCheck.error.message}`);
  }

  if (refCheck.status !== 0) {
    fail(
      'Could not resolve "origin/main". Run "git fetch origin main" and retry release validation.',
    );
  }

  const result = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.error) {
    fail(`Failed to run git ancestry check: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    fail(
      stderr
        ? `HEAD must be contained in origin/main before release. git merge-base output: ${stderr}`
        : "HEAD must be contained in origin/main before release.",
    );
  }
}

function readJsonFile(path: string): PackageJson {
  try {
    const contents = readFileSync(path, "utf8");
    return JSON.parse(contents) as PackageJson;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Failed to read ${path}: ${message}`);
  }
}

function readStringField(
  manifest: PackageJson,
  field: keyof PackageJson,
  manifestPath: string,
) {
  const value = manifest[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`Missing or invalid "${field}" in ${manifestPath}.`);
  }

  return value;
}

function fail(message: string): never {
  throw new Error(message);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Release validation failed: ${message}`);
  process.exit(1);
}