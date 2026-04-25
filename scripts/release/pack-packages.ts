import {
	cp,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { collectReleaseUnits, parseDryRunFlag } from "./release-config";
import {
	PACK_MANIFEST_PATH,
	type PackedArtifact,
	type PackManifest,
} from "./utils/artifacts";
import { runCommand } from "./utils/exec";
import {
	ARTIFACT_DIRS,
	cleanDir,
	copyFileOrDir,
	ensureArtifactDirs,
	exists,
	listFilesRecursive,
	REPO_ROOT,
	writeJsonFile,
} from "./utils/fs";
import { resolveNpmCommand } from "./utils/npm";
import type { PackageJson } from "./utils/package-json";
import { computeDependencySafeOrder } from "./utils/package-order";

const WORKSPACE_PROTOCOL = "workspace:";

async function getTgzFiles(directoryPath: string) {
	const files = await listFilesRecursive(directoryPath);
	return files.filter((file) => file.endsWith(".tgz")).sort();
}

function rewriteWorkspaceRange(range: string, version: string) {
	const workspaceRange = range.slice(WORKSPACE_PROTOCOL.length);
	if (workspaceRange === "" || workspaceRange === "*") {
		return version;
	}
	if (workspaceRange === "^" || workspaceRange === "~") {
		return `${workspaceRange}${version}`;
	}
	return workspaceRange;
}

function rewritePublishedDependencyRanges(
	manifest: PackageJson,
	publishedVersions: ReadonlyMap<string, string>,
) {
	const nextManifest: PackageJson = { ...manifest };
	const fields: Array<
		keyof Pick<
			PackageJson,
			"dependencies" | "peerDependencies" | "optionalDependencies"
		>
	> = ["dependencies", "peerDependencies", "optionalDependencies"];

	for (const field of fields) {
		const deps = manifest[field];
		if (!deps || typeof deps !== "object") {
			continue;
		}

		const nextDeps: Record<string, string> = { ...deps };
		let fieldChanged = false;

		for (const [depName, range] of Object.entries(deps)) {
			if (!range.startsWith(WORKSPACE_PROTOCOL)) {
				continue;
			}

			const publishedVersion = publishedVersions.get(depName);
			if (!publishedVersion) {
				throw new Error(
					`Unable to rewrite ${manifest.name ?? "<unknown>"} ${field} dependency ${depName}=${range}: missing published version.`,
				);
			}

			nextDeps[depName] = rewriteWorkspaceRange(range, publishedVersion);
			fieldChanged = true;
		}

		if (fieldChanged) {
			nextManifest[field] = nextDeps;
		}
	}

	return nextManifest;
}

function getWorkspaceBuildOrder(
	releaseUnits: Awaited<ReturnType<typeof collectReleaseUnits>>,
) {
	const buildableUnits = releaseUnits.filter((unit) => unit.kind === "npm");
	const manifests = new Map(
		buildableUnits.map((unit) => [unit.name, unit.source.manifest]),
	);
	return computeDependencySafeOrder(
		manifests,
		buildableUnits.map((unit) => unit.name),
	);
}

async function packWorkspacePackage(
	unit: {
		absPath: string;
		name: string;
		version: string;
	},
	publishedVersions: ReadonlyMap<string, string>,
	npmCommand: string,
) {
	const stagingRoot = await mkdtemp(join(tmpdir(), "vela-rbxts-pack-"));
	const stagingDir = join(stagingRoot, basename(unit.absPath));

	try {
		await cp(unit.absPath, stagingDir, { recursive: true });

		const manifestPath = join(stagingDir, "package.json");
		const manifest = JSON.parse(
			await readFile(manifestPath, "utf8"),
		) as PackageJson;
		const rewrittenManifest = rewritePublishedDependencyRanges(
			manifest,
			publishedVersions,
		);
		await writeFile(
			manifestPath,
			`${JSON.stringify(rewrittenManifest, null, 2)}\n`,
			"utf8",
		);

		const before = await getTgzFiles(ARTIFACT_DIRS.npm);
		runCommand(
			npmCommand,
			[
				"pack",
				stagingDir,
				"--pack-destination",
				ARTIFACT_DIRS.npm,
				"--ignore-scripts",
			],
			{ cwd: REPO_ROOT },
		);
		const after = await getTgzFiles(ARTIFACT_DIRS.npm);
		const tarballPath = await detectSingleNewTarball(before, after, unit.name);

		return tarballPath;
	} finally {
		await rm(stagingRoot, { recursive: true, force: true });
	}
}

async function detectSingleNewTarball(
	before: readonly string[],
	after: readonly string[],
	context: string,
) {
	const beforeSet = new Set(before);
	const newFiles = after.filter((file) => !beforeSet.has(file));
	if (newFiles.length !== 1) {
		throw new Error(
			`Expected exactly one new tarball for ${context}, found ${newFiles.length}.`,
		);
	}
	return newFiles[0];
}

async function copyBuildArtifactsIntoPackageRoots() {
	const compilerArtifactSource = ARTIFACT_DIRS.native;
	const compilerArtifactDest = join(REPO_ROOT, "packages/compiler/artifacts");
	const lspArtifactSource = ARTIFACT_DIRS.lsp;
	const lspArtifactDest = join(REPO_ROOT, "packages/lsp/artifacts");

	if (!exists(compilerArtifactSource)) {
		throw new Error(
			`Missing compiler artifacts directory: ${compilerArtifactSource}`,
		);
	}
	if (!exists(lspArtifactSource)) {
		throw new Error(`Missing LSP artifacts directory: ${lspArtifactSource}`);
	}

	await cleanDir(compilerArtifactDest);
	for (const filePath of await listFilesRecursive(compilerArtifactSource)) {
		await copyFileOrDir(
			filePath,
			join(compilerArtifactDest, basename(filePath)),
		);
	}

	await cleanDir(lspArtifactDest);
	const lspTargets = await readdir(lspArtifactSource, { withFileTypes: true });
	for (const targetDir of lspTargets) {
		if (!targetDir.isDirectory()) {
			continue;
		}
		const sourcePath = join(lspArtifactSource, targetDir.name);
		const destinationPath = join(lspArtifactDest, targetDir.name);
		await copyFileOrDir(sourcePath, destinationPath);
	}
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const dryRun = parseDryRunFlag(rawArgs);
	const releaseUnits = await collectReleaseUnits();
	const publishedVersions = new Map(
		releaseUnits.map((unit) => [unit.name, unit.version]),
	);
	const workspaceBuildOrder = getWorkspaceBuildOrder(releaseUnits);
	const npmUnits = releaseUnits.filter(
		(unit) =>
			unit.publishToNpm && unit.kind !== "native" && unit.kind !== "lsp",
	);

	if (!dryRun) {
		for (const packageName of workspaceBuildOrder) {
			runCommand("pnpm", ["--filter", packageName, "run", "build"], {
				cwd: REPO_ROOT,
			});
		}
		await ensureArtifactDirs();
		await cleanDir(ARTIFACT_DIRS.npm);
	}

	if (dryRun) {
		console.log(
			"[dry-run] release:pack would build workspace npm packages before packing tarballs.",
		);
		for (const packageName of workspaceBuildOrder) {
			console.log(`[dry-run] pnpm --filter ${packageName} run build`);
		}
		console.log(
			"[dry-run] release:pack would stage compiler+lsp package trees and pack npm tarballs.",
		);
		for (const unit of npmUnits) {
			console.log(
				`[dry-run] pack workspace package ${unit.name} from ${unit.path}`,
			);
		}
		console.log(
			"[dry-run] pack staged @vela-rbxts/compiler root and native subpackages",
		);
		console.log(
			"[dry-run] pack staged @vela-rbxts/lsp wrapper and binary subpackages",
		);
		return;
	}

	await copyBuildArtifactsIntoPackageRoots();

	runCommand(
		"pnpm",
		["--filter", "@vela-rbxts/compiler", "run", "stage:napi"],
		{
			cwd: REPO_ROOT,
		},
	);
	runCommand("pnpm", ["--filter", "@vela-rbxts/lsp", "run", "stage:lsp"], {
		cwd: REPO_ROOT,
	});

	const npmCommand = resolveNpmCommand();
	const packedArtifacts: PackedArtifact[] = [];

	for (const unit of npmUnits) {
		const tarballPath = await packWorkspacePackage(
			unit,
			publishedVersions,
			npmCommand,
		);
		packedArtifacts.push({
			packageName: unit.name,
			version: unit.version,
			tarballFileName: basename(tarballPath),
			tarballPath,
			sourceDir: unit.absPath,
			kind: "workspace",
		});
	}

	const stagedCompilerRoot = join(REPO_ROOT, "packages/compiler/.npm/publish");
	const stagedCompilerTargetsRoot = join(stagedCompilerRoot, "npm");
	const stagedLspRoot = join(REPO_ROOT, "packages/lsp/.npm/publish");
	const stagedLspTargetsRoot = join(stagedLspRoot, "npm");

	for (const stagedPath of [stagedCompilerRoot, stagedLspRoot]) {
		const before = await getTgzFiles(ARTIFACT_DIRS.npm);
		runCommand(
			npmCommand,
			[
				"pack",
				stagedPath,
				"--pack-destination",
				ARTIFACT_DIRS.npm,
				"--ignore-scripts",
			],
			{ cwd: REPO_ROOT },
		);
		const after = await getTgzFiles(ARTIFACT_DIRS.npm);
		const tarballPath = await detectSingleNewTarball(before, after, stagedPath);
		const packageJson = JSON.parse(
			await import("node:fs/promises").then((fs) =>
				fs.readFile(join(stagedPath, "package.json"), "utf8"),
			),
		) as { name: string; version: string };
		packedArtifacts.push({
			packageName: packageJson.name,
			version: packageJson.version,
			tarballFileName: basename(tarballPath),
			tarballPath,
			sourceDir: stagedPath,
			kind: stagedPath.includes("compiler") ? "compiler" : "lsp",
		});
	}

	for (const [root, kind] of [
		[stagedCompilerTargetsRoot, "compiler" as const],
		[stagedLspTargetsRoot, "lsp" as const],
	]) {
		const entries = await readdir(root, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const stageDir = join(root, entry.name);
			const before = await getTgzFiles(ARTIFACT_DIRS.npm);
			runCommand(
				npmCommand,
				[
					"pack",
					stageDir,
					"--pack-destination",
					ARTIFACT_DIRS.npm,
					"--ignore-scripts",
				],
				{ cwd: REPO_ROOT },
			);
			const after = await getTgzFiles(ARTIFACT_DIRS.npm);
			const tarballPath = await detectSingleNewTarball(
				before,
				after,
				`${kind}:${entry.name}`,
			);
			const packageJson = JSON.parse(
				await import("node:fs/promises").then((fs) =>
					fs.readFile(join(stageDir, "package.json"), "utf8"),
				),
			) as { name: string; version: string };
			packedArtifacts.push({
				packageName: packageJson.name,
				version: packageJson.version,
				tarballFileName: basename(tarballPath),
				tarballPath,
				sourceDir: stageDir,
				kind,
			});
		}
	}

	packedArtifacts.sort((left, right) =>
		left.packageName.localeCompare(right.packageName),
	);
	const manifest: PackManifest = {
		createdAt: new Date().toISOString(),
		artifactsRoot: ARTIFACT_DIRS.npm,
		artifacts: packedArtifacts,
	};
	await writeJsonFile(PACK_MANIFEST_PATH, manifest);

	console.log("Packed tarballs:");
	for (const artifact of packedArtifacts) {
		console.log(
			`- ${artifact.packageName}@${artifact.version}: ${artifact.tarballFileName}`,
		);
	}
	console.log(`Pack manifest: ${PACK_MANIFEST_PATH}`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:pack failed: ${message}`);
	process.exit(1);
});
