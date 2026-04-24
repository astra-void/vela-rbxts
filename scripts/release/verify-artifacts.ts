import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { collectReleaseUnits } from "./release-config";
import {
	PACK_MANIFEST_PATH,
	type PackedArtifact,
	type PackManifest,
	listTarEntries,
	readTarTextFile,
	VERIFY_REPORT_PATH,
} from "./utils/artifacts";
import {
	ARTIFACT_DIRS,
	exists,
	REPO_ROOT,
	writeJsonFile,
} from "./utils/fs";
import { type PackageJson } from "./utils/package-json";
import { readJsonFile } from "./utils/fs";

type TarballPackageInfo = {
	artifact: PackedArtifact;
	manifest: PackageJson;
	entries: string[];
};

const FORBIDDEN_PATTERNS = ["/.turbo/", "/node_modules/", "/.cache/", "__fixtures__", "/fixtures/"];

function readTarballPackageJson(tarballPath: string) {
	const raw = readTarTextFile(tarballPath, "package/package.json");
	return JSON.parse(raw) as PackageJson;
}

function hasForbiddenEntry(entries: readonly string[]) {
	for (const entry of entries) {
		const normalized = `/${entry.replace(/\\/g, "/")}`;
		if (FORBIDDEN_PATTERNS.some((pattern) => normalized.includes(pattern))) {
			return normalized;
		}
	}
	return undefined;
}

function assertNoWorkspaceProtocol(manifest: PackageJson, packageName: string) {
	const fields: Array<keyof PackageJson> = [
		"dependencies",
		"peerDependencies",
		"optionalDependencies",
	];

	for (const field of fields) {
		const deps = manifest[field];
		if (!deps || typeof deps !== "object") {
			continue;
		}
		for (const [depName, range] of Object.entries(deps)) {
			if (range.startsWith("workspace:") || range.startsWith("file:") || range.startsWith("link:")) {
				throw new Error(
					`${packageName} has forbidden published dependency ${depName}=${range} in ${field}.`,
				);
			}
		}
	}
}

function assertRequiredEntry(entries: readonly string[], path: string, context: string) {
	if (!entries.includes(path)) {
		throw new Error(`Missing required ${context} entry: ${path}`);
	}
}

function assertManifestFieldEntries(
	manifest: PackageJson,
	entries: readonly string[],
	packageName: string,
) {
	if (typeof manifest.main === "string") {
		assertRequiredEntry(entries, `package/${manifest.main.replace(/^\.\//, "")}`, `${packageName} main`);
	}

	if (typeof manifest.types === "string") {
		assertRequiredEntry(entries, `package/${manifest.types.replace(/^\.\//, "")}`, `${packageName} types`);
	}

	if (typeof manifest.exports === "string") {
		assertRequiredEntry(entries, `package/${manifest.exports.replace(/^\.\//, "")}`, `${packageName} exports`);
	}
}

async function main() {
	if (!exists(PACK_MANIFEST_PATH)) {
		throw new Error(`Missing pack manifest at ${PACK_MANIFEST_PATH}. Run release:pack first.`);
	}

	const releaseUnits = await collectReleaseUnits();
	const expectedNpmPackageNames = new Set(
		releaseUnits.filter((unit) => unit.publishToNpm).map((unit) => unit.name),
	);

	const packManifest = await readJsonFile<PackManifest>(PACK_MANIFEST_PATH);
	const tarballInfos: TarballPackageInfo[] = [];

	for (const artifact of packManifest.artifacts) {
		if (!exists(artifact.tarballPath)) {
			throw new Error(`Missing packed tarball: ${artifact.tarballPath}`);
		}

		const entries = listTarEntries(artifact.tarballPath);
		const forbiddenEntry = hasForbiddenEntry(entries);
		if (forbiddenEntry) {
			throw new Error(`Forbidden packed file detected in ${artifact.tarballFileName}: ${forbiddenEntry}`);
		}

		const tarManifest = readTarballPackageJson(artifact.tarballPath);
		if (tarManifest.name !== artifact.packageName) {
			throw new Error(
				`Tarball package name mismatch for ${artifact.tarballFileName}. Expected ${artifact.packageName}, got ${String(tarManifest.name)}.`,
			);
		}
		if (tarManifest.version !== artifact.version) {
			throw new Error(
				`Tarball package version mismatch for ${artifact.tarballFileName}. Expected ${artifact.version}, got ${String(tarManifest.version)}.`,
			);
		}

		if (artifact.packageName.startsWith("@vela-rbxts/")) {
			const access = tarManifest.publishConfig?.access;
			if (access !== "public") {
				throw new Error(
					`${artifact.packageName} is scoped and must set publishConfig.access to public in packed manifest.`,
				);
			}
		}

		assertNoWorkspaceProtocol(tarManifest, artifact.packageName);
		assertManifestFieldEntries(tarManifest, entries, artifact.packageName);
		tarballInfos.push({ artifact, manifest: tarManifest, entries });
	}

	const tarballPackageNames = new Set(tarballInfos.map((entry) => entry.artifact.packageName));
	for (const expectedName of expectedNpmPackageNames) {
		if (!tarballPackageNames.has(expectedName)) {
			throw new Error(`Missing packed tarball for ${expectedName}.`);
		}
	}

	const compilerRootTarball = tarballInfos.find(
		(entry) => entry.artifact.packageName === "@vela-rbxts/compiler",
	);
	if (!compilerRootTarball) {
		throw new Error("Missing @vela-rbxts/compiler tarball.");
	}
	assertRequiredEntry(compilerRootTarball.entries, "package/entry.cjs", "compiler entry");
	assertRequiredEntry(compilerRootTarball.entries, "package/entry.d.ts", "compiler types");
	assertRequiredEntry(compilerRootTarball.entries, "package/index.js", "compiler native entry");
	assertRequiredEntry(compilerRootTarball.entries, "package/index.d.ts", "compiler native types");

	const compilerManifest = await readJsonFile<PackageJson>(
		join(REPO_ROOT, "packages/compiler/package.json"),
	);
	const compilerTargets = compilerManifest.napi?.targets ?? [];
	for (const target of compilerTargets) {
		const artifactPath = join(ARTIFACT_DIRS.native, `compiler.${target}.node`);
		if (!exists(artifactPath)) {
			throw new Error(`Missing compiler native artifact for target ${target}: ${artifactPath}`);
		}
	}

	const lspPackageConfig = (await import(
		pathToFileURL(join(REPO_ROOT, "packages/lsp/scripts/package-config.mjs")).href
	)) as {
		BINARY_PACKAGE_CONFIGS: Array<{ name: string; target: string; os: string }>;
		getBinaryFileName: (os: string) => string;
		getBinaryPackageName: (
			platform: NodeJS.Platform,
			arch: NodeJS.Architecture,
			runtimeKind?: "gnu" | "musl",
		) => string | undefined;
	};

	for (const config of lspPackageConfig.BINARY_PACKAGE_CONFIGS) {
		if (!tarballPackageNames.has(config.name)) {
			throw new Error(`Missing packed LSP binary package tarball for ${config.name}.`);
		}
		const artifactPath = join(
			ARTIFACT_DIRS.lsp,
			config.target,
			lspPackageConfig.getBinaryFileName(config.os),
		);
		if (!exists(artifactPath)) {
			throw new Error(`Missing LSP artifact for target ${config.target}: ${artifactPath}`);
		}
	}

	const runtimeKind = process.platform === "linux" && !process.report?.getReport?.().header?.glibcVersionRuntime
		? "musl"
		: "gnu";
	const currentPlatformLspPackage = lspPackageConfig.getBinaryPackageName(
		process.platform,
		process.arch,
		runtimeKind,
	);
	if (!currentPlatformLspPackage) {
		throw new Error(
			`No LSP binary package mapping for ${process.platform}/${process.arch}.`,
		);
	}
	if (!tarballPackageNames.has(currentPlatformLspPackage)) {
		throw new Error(
			`Missing packed tarball for current platform LSP package ${currentPlatformLspPackage}.`,
		);
	}

	await writeJsonFile(VERIFY_REPORT_PATH, {
		verifiedAt: new Date().toISOString(),
		verifiedTarballs: packManifest.artifacts.map((artifact) => ({
			packageName: artifact.packageName,
			version: artifact.version,
			tarballPath: artifact.tarballPath,
		})),
	});

	console.log("Artifact verification succeeded.");
	console.log(`Verification report: ${VERIFY_REPORT_PATH}`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:verify failed: ${message}`);
	process.exit(1);
});
