import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseDryRunFlag } from "./release-config";
import { runCommand } from "./utils/exec";
import {
	ARTIFACT_DIRS,
	cleanDir,
	copyFileOrDir,
	exists,
	listFilesRecursive,
	REPO_ROOT,
} from "./utils/fs";

function detectLinuxRuntimeKind() {
	if (typeof process.report?.getReport !== "function") {
		return "musl";
	}

	const report = process.report.getReport();
	return report?.header?.glibcVersionRuntime ? "gnu" : "musl";
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const dryRun = parseDryRunFlag(rawArgs);

	const lspPackageConfig = (await import(
		pathToFileURL(join(REPO_ROOT, "packages/lsp/scripts/package-config.mjs")).href
	)) as {
		getBinaryPackageName: (
			platform: NodeJS.Platform,
			arch: NodeJS.Architecture,
			runtimeKind?: "gnu" | "musl",
		) => string | undefined;
		BINARY_PACKAGE_CONFIGS: Array<{ name: string; target: string; os: string }>;
		getBinaryFileName: (os: string) => string;
	};

	const runtimeKind = process.platform === "linux" ? detectLinuxRuntimeKind() : "gnu";
	const platformPackageName = lspPackageConfig.getBinaryPackageName(
		process.platform,
		process.arch,
		runtimeKind,
	);
	if (!platformPackageName) {
		throw new Error(
			`No LSP package mapping for platform ${process.platform}/${process.arch}.`,
		);
	}

	const platformConfig = lspPackageConfig.BINARY_PACKAGE_CONFIGS.find(
		(entry) => entry.name === platformPackageName,
	);
	if (!platformConfig) {
		throw new Error(`Could not find target config for ${platformPackageName}.`);
	}

	const expectedBinaryPath = join(
		ARTIFACT_DIRS.lsp,
		platformConfig.target,
		lspPackageConfig.getBinaryFileName(platformConfig.os),
	);
	if (!exists(expectedBinaryPath)) {
		throw new Error(
			`Missing required LSP binary for current platform: ${expectedBinaryPath}. Run release:build first.`,
		);
	}

	const packageLspArtifactsDir = join(REPO_ROOT, "packages/lsp/artifacts");
	await cleanDir(packageLspArtifactsDir);
	const lspTargets = await readdir(ARTIFACT_DIRS.lsp, { withFileTypes: true });
	for (const target of lspTargets) {
		if (!target.isDirectory()) {
			continue;
		}
		await copyFileOrDir(
			join(ARTIFACT_DIRS.lsp, target.name),
			join(packageLspArtifactsDir, target.name),
		);
	}

	runCommand("pnpm", ["--filter", "@vela-rbxts/lsp", "run", "stage:lsp"], {
		cwd: REPO_ROOT,
	});

	if (dryRun) {
		console.log("[dry-run] VSIX packaging prerequisites validated and LSP artifacts staged.");
		return;
	}

	runCommand("pnpm", ["--filter", "./packages/vscode-extension", "run", "package:vsix"], {
		cwd: REPO_ROOT,
	});

	await cleanDir(ARTIFACT_DIRS.vsix);
	const builtVsixFiles = (await listFilesRecursive(join(REPO_ROOT, "packages/vscode-extension/dist"))).filter((file) =>
		file.endsWith(".vsix"),
	);
	if (builtVsixFiles.length === 0) {
		throw new Error("No VSIX produced in packages/vscode-extension/dist.");
	}

	for (const filePath of builtVsixFiles) {
		await copyFileOrDir(filePath, join(ARTIFACT_DIRS.vsix, basename(filePath)));
	}

	console.log("VSIX packages:");
	for (const filePath of builtVsixFiles) {
		console.log(`- ${filePath}`);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:vsix failed: ${message}`);
	process.exit(1);
});
