import { discoverWorkspacePackages, type WorkspacePackage } from "./utils/package-json";

export const RELEASE_TAGS = ["next", "latest"] as const;
export type ReleaseTag = (typeof RELEASE_TAGS)[number];

export type ReleaseKind = "npm" | "native" | "lsp" | "vscode-extension";

export type ReleaseUnit = {
  name: string;
  version: string;
  path: string;
  absPath: string;
  kind: ReleaseKind;
  publishToNpm: boolean;
  private: boolean;
  source: WorkspacePackage;
};

export const EXPECTED_PUBLIC_RELEASE_NAMES = [
  "vela-rbxts",
  "@vela-rbxts/compiler",
  "@vela-rbxts/config",
  "@vela-rbxts/core",
  "@vela-rbxts/ir",
  "@vela-rbxts/types",
  "@vela-rbxts/rbxtsc-host",
  "@vela-rbxts/lsp",
  "vela-rbxts-lsp",
] as const;

export const WORKSPACE_PUBLISH_PRIORITY = [
  "@vela-rbxts/types",
  "@vela-rbxts/config",
  "@vela-rbxts/ir",
  "@vela-rbxts/core",
  "@vela-rbxts/rbxtsc-host",
  "@vela-rbxts/compiler",
  "@vela-rbxts/lsp",
  "vela-rbxts",
] as const;

export function parseReleaseTag(rawTag: string | undefined): ReleaseTag {
  const tag = rawTag?.trim();
  if (!tag || !RELEASE_TAGS.includes(tag as ReleaseTag)) {
    throw new Error(
      `Missing or invalid --tag. Expected one of: ${RELEASE_TAGS.join(", ")}.`,
    );
  }

  return tag as ReleaseTag;
}

export function parseDryRunFlag(rawArgs: readonly string[]) {
  return rawArgs.includes("--dry-run");
}

export function getFlagValue(
  rawArgs: readonly string[],
  flagName: string,
) {
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === flagName) {
      return rawArgs[index + 1];
    }

    const prefix = `${flagName}=`;
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }

  return undefined;
}

export async function collectReleaseUnits() {
  const workspacePackages = await discoverWorkspacePackages();
  const releaseUnits: ReleaseUnit[] = [];

  for (const pkg of workspacePackages) {
    if (!pkg.path.startsWith("packages/")) {
      continue;
    }

    const name = pkg.manifest.name?.trim();
    const version = pkg.manifest.version?.trim();
    if (!name || !version) {
      continue;
    }

    const isPrivate = pkg.manifest.private === true;
    const kind = classifyPackageKind(pkg.path, name);
    if (!kind) {
      continue;
    }

    const publishToNpm = kind !== "vscode-extension";
    const isPublicUnit =
      kind === "lsp" || kind === "vscode-extension" || !isPrivate;

    if (!isPublicUnit) {
      continue;
    }

    releaseUnits.push({
      name,
      version,
      path: pkg.path,
      absPath: pkg.absolutePath,
      kind,
      publishToNpm,
      private: isPrivate,
      source: pkg,
    });
  }

  validateReleaseUnitNames(releaseUnits);
  return releaseUnits.sort((left, right) => left.path.localeCompare(right.path));
}

function classifyPackageKind(path: string, packageName: string): ReleaseKind | undefined {
  if (path === "packages/vscode-extension") {
    return "vscode-extension";
  }

  if (path === "packages/compiler" || packageName === "@vela-rbxts/compiler") {
    return "native";
  }

  if (path === "packages/lsp" || packageName === "@vela-rbxts/lsp") {
    return "lsp";
  }

  if (packageName === "vela-rbxts" || packageName.startsWith("@vela-rbxts/")) {
    return "npm";
  }

  return undefined;
}

function validateReleaseUnitNames(releaseUnits: readonly ReleaseUnit[]) {
  for (const unit of releaseUnits) {
    if (unit.kind === "vscode-extension") {
      if (unit.name !== "vela-rbxts-lsp") {
        throw new Error(
          `Unexpected VS Code extension package name "${unit.name}" at ${unit.path}. Expected "vela-rbxts-lsp".`,
        );
      }
      continue;
    }

    if (unit.name !== "vela-rbxts" && !unit.name.startsWith("@vela-rbxts/")) {
      throw new Error(
        `Unexpected package name "${unit.name}" at ${unit.path}. Expected "vela-rbxts" or "@vela-rbxts/*".`,
      );
    }
  }

  const discoveredNames = new Set(releaseUnits.map((unit) => unit.name));
  for (const expectedName of EXPECTED_PUBLIC_RELEASE_NAMES) {
    if (!discoveredNames.has(expectedName)) {
      throw new Error(
        `Expected release package "${expectedName}" was not discovered from workspace metadata.`,
      );
    }
  }
}
