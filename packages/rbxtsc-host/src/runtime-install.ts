import fs from "node:fs";
import path from "node:path";

import { createHostDiagnostic } from "./diagnostics.js";
import type { HostDiagnostic } from "./types.js";

const RUNTIME_IMPORT = /\bfrom\s+"(@rbxts\/vela-runtime(?:-vide)?)"/g;
const SCOPE = "@rbxts/";
const VELA_RUNTIME_PREFIX = "@rbxts/vela-";

type Manifest = {
	version?: string;
	dependencies?: Record<string, string>;
};

const packageRootCache = new Map<string, string | undefined>();
let ownVersion: string | null | undefined;

// The runtime loads its own deps with `TS.getModule`, which only searches the `node_modules/@rbxts` Rojo maps; pnpm's default linker leaves them out of it.
export function checkRuntimeInstall(
	fileName: string,
	code: string,
): HostDiagnostic | undefined {
	const modules = new Set<string>();
	for (const match of code.matchAll(RUNTIME_IMPORT)) {
		modules.add(match[1]);
	}

	if (modules.size === 0) {
		return undefined;
	}

	const packageRoot = findPackageRoot(path.dirname(path.resolve(fileName)));
	if (packageRoot === undefined) {
		return undefined;
	}

	const scopeDir = path.join(packageRoot, "node_modules", "@rbxts");
	const missing: string[] = [];
	const skewed: string[] = [];
	const expectedVersion = readOwnVersion();
	const visited = new Set<string>();
	const pending = [...modules].map((name) => ({ name, requiredBy: "" }));

	while (pending.length > 0) {
		const { name, requiredBy } = pending.shift() as (typeof pending)[number];
		if (visited.has(name)) {
			continue;
		}
		visited.add(name);

		const manifest = readManifest(
			path.join(scopeDir, name.slice(SCOPE.length), "package.json"),
		);
		if (manifest === undefined) {
			missing.push(requiredBy ? `${name} (required by ${requiredBy})` : name);
			continue;
		}

		if (
			expectedVersion !== undefined &&
			name.startsWith(VELA_RUNTIME_PREFIX) &&
			manifest.version !== expectedVersion
		) {
			skewed.push(`${name}@${manifest.version ?? "unknown"}`);
		}

		for (const dependency of Object.keys(manifest.dependencies ?? {})) {
			if (dependency.startsWith(SCOPE)) {
				pending.push({ name: dependency, requiredBy: name });
			}
		}
	}

	if (missing.length === 0 && skewed.length === 0) {
		return undefined;
	}

	const imported = [...modules].join(" and ");
	const problems: string[] = [];
	if (missing.length > 0) {
		problems.push(
			`${scopeDir} has no ${missing.join(", ")}. Rojo maps only that folder into the place, so the runtime would fail to load on play with "Could not find module". pnpm's default linker keeps a dependency's own dependencies out of it: add publicHoistPattern: ["*@rbxts*"] to pnpm-workspace.yaml (older pnpm reads public-hoist-pattern[]=*@rbxts* from .npmrc) and reinstall.`,
		);
	}
	if (skewed.length > 0) {
		problems.push(
			`${skewed.join(", ")} in ${scopeDir} is not the version this compiler emits for (${expectedVersion}). Install the runtime packages at the same version as vela-rbxts.`,
		);
	}

	return createHostDiagnostic({
		level: "error",
		code: "runtime-not-installed",
		message: `This file imports ${imported}, which the place cannot load as installed: ${problems.join(" ")}`,
	});
}

function readManifest(manifestPath: string): Manifest | undefined {
	try {
		return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
	} catch {
		return undefined;
	}
}

// The version the runtime packages are released at, since they share one with this host.
function readOwnVersion(): string | undefined {
	if (ownVersion === undefined) {
		ownVersion =
			readManifest(path.join(__dirname, "..", "package.json"))?.version ?? null;
	}

	return ownVersion ?? undefined;
}

// roblox-ts takes `node_modules` from beside the nearest package.json, so the check does too.
function findPackageRoot(directory: string): string | undefined {
	if (packageRootCache.has(directory)) {
		return packageRootCache.get(directory);
	}

	const parent = path.dirname(directory);
	const root = fs.existsSync(path.join(directory, "package.json"))
		? directory
		: parent === directory
			? undefined
			: findPackageRoot(parent);
	packageRootCache.set(directory, root);

	return root;
}
