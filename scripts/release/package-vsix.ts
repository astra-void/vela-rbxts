import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { parseDryRunFlag } from "./release-config";
import { runCommand } from "./utils/exec";
import {
	ARTIFACT_DIRS,
	cleanDir,
	copyFileOrDir,
	exists,
	REPO_ROOT,
	readJsonFile,
} from "./utils/fs";

const require = createRequire(import.meta.url);
const {
	SUPPORTED_VSCODE_TARGETS,
	VSCODE_TARGETS,
} = require("../../packages/vscode-extension/scripts/vsix-targets.cjs") as {
	SUPPORTED_VSCODE_TARGETS: string[];
	VSCODE_TARGETS: Record<
		string,
		{
			lspFolder: string;
			packageName: string;
		}
	>;
};

type ExtensionPackageJson = {
	version?: string;
};

type LspPackageConfig = {
	BINARY_PACKAGE_CONFIGS: Array<{
		directory: string;
		name: string;
		os: string;
		target: string;
	}>;
	getBinaryFileName: (os: string) => string;
};

function getVsixOutputPath(version: string, target: string) {
	return join(ARTIFACT_DIRS.vsix, `vela-rbxts-lsp-${version}-${target}.vsix`);
}

function assertVsixTargetsCoverage(lspPackageConfig: LspPackageConfig) {
	for (const target of SUPPORTED_VSCODE_TARGETS) {
		const targetConfig = VSCODE_TARGETS[target];
		if (!targetConfig) {
			throw new Error(`Missing VSIX target config for ${target}.`);
		}

		const lspConfig = lspPackageConfig.BINARY_PACKAGE_CONFIGS.find(
			(entry) => entry.directory === targetConfig.lspFolder,
		);
		if (!lspConfig) {
			throw new Error(
				`VSIX target ${target} maps to missing LSP folder ${targetConfig.lspFolder}.`,
			);
		}

		if (lspConfig.name !== targetConfig.packageName) {
			throw new Error(
				`VSIX target ${target} maps to ${targetConfig.packageName}, but LSP config declares ${lspConfig.name} for folder ${targetConfig.lspFolder}.`,
			);
		}
	}
}

function validateLspArtifactsForTarget(target: string, lspPackageConfig: LspPackageConfig) {
	const targetConfig = VSCODE_TARGETS[target];
	if (!targetConfig) {
		throw new Error(`Unsupported VSIX target ${target}.`);
	}

	const lspConfig = lspPackageConfig.BINARY_PACKAGE_CONFIGS.find(
		(entry) => entry.directory === targetConfig.lspFolder,
	);
	if (!lspConfig) {
		throw new Error(
			`Missing LSP package config for target ${target} (${targetConfig.lspFolder}).`,
		);
	}

	const expectedBinaryPath = join(
		ARTIFACT_DIRS.lsp,
		lspConfig.target,
		lspPackageConfig.getBinaryFileName(lspConfig.os),
	);

	if (!exists(expectedBinaryPath)) {
		throw new Error(
			`Missing required LSP binary for ${target} (${targetConfig.packageName}): ${expectedBinaryPath}. Run release:build first.`,
		);
	}

	return {
		targetConfig,
		lspConfig,
		expectedBinaryPath,
	};
}

function validateStagedPublishPackagesForTarget(target: string) {
	const targetConfig = VSCODE_TARGETS[target];
	const stagedPackageJsonPath = join(
		REPO_ROOT,
		"packages/lsp/.npm/publish/npm",
		targetConfig.lspFolder,
		"package.json",
	);

	if (!exists(stagedPackageJsonPath)) {
		throw new Error(
			`Missing staged package metadata for ${target} at ${stagedPackageJsonPath}.`,
		);
	}

	const stagedManifest = JSON.parse(
		require("node:fs").readFileSync(stagedPackageJsonPath, "utf8"),
	) as { name?: string; bin?: string | Record<string, string> };

	if (stagedManifest.name !== targetConfig.packageName) {
		throw new Error(
			`Staged package mismatch for ${target}. Expected ${targetConfig.packageName}, found ${String(stagedManifest.name)} at ${stagedPackageJsonPath}.`,
		);
	}

	const binEntry =
		typeof stagedManifest.bin === "string"
			? stagedManifest.bin
			: stagedManifest.bin?.["vela-rbxts-lsp"];
	if (typeof binEntry !== "string") {
		throw new Error(
			`Staged package ${targetConfig.packageName} is missing bin.vela-rbxts-lsp for ${target}.`,
		);
	}

	const stagedBinaryPath = join(
		REPO_ROOT,
		"packages/lsp/.npm/publish/npm",
		targetConfig.lspFolder,
		binEntry,
	);
	if (!exists(stagedBinaryPath)) {
		throw new Error(
			`Staged package ${targetConfig.packageName} for ${target} is missing binary at ${stagedBinaryPath}.`,
		);
	}
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const dryRun = parseDryRunFlag(rawArgs);
	const extensionManifest = await readJsonFile<ExtensionPackageJson>(
		join(REPO_ROOT, "packages/vscode-extension/package.json"),
	);
	const version = String(extensionManifest.version ?? "0.1.0");

	const lspPackageConfig = (await import(
		pathToFileURL(join(REPO_ROOT, "packages/lsp/scripts/package-config.mjs")).href
	)) as LspPackageConfig;

	assertVsixTargetsCoverage(lspPackageConfig);

	for (const target of SUPPORTED_VSCODE_TARGETS) {
		validateLspArtifactsForTarget(target, lspPackageConfig);
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

	for (const target of SUPPORTED_VSCODE_TARGETS) {
		validateStagedPublishPackagesForTarget(target);
	}

	if (dryRun) {
		console.log("[dry-run] VSIX packaging prerequisites validated and LSP artifacts staged.");
		for (const target of SUPPORTED_VSCODE_TARGETS) {
			const targetConfig = VSCODE_TARGETS[target];
			console.log(
				`[dry-run] would package ${target} using ${targetConfig.packageName} -> ${getVsixOutputPath(version, target)}`,
			);
		}
		return;
	}

	await cleanDir(ARTIFACT_DIRS.vsix);

	for (const target of SUPPORTED_VSCODE_TARGETS) {
		const outputPath = getVsixOutputPath(version, target);
		runCommand(
			process.execPath,
			[
				join(REPO_ROOT, "packages/vscode-extension/scripts/package-vsix.cjs"),
				"--target",
				target,
				"--out",
				outputPath,
			],
			{ cwd: REPO_ROOT },
		);

		if (!exists(outputPath)) {
			throw new Error(
				`Expected VSIX output missing for ${target}: ${outputPath}.`,
			);
		}
	}

	console.log("VSIX packages:");
	for (const target of SUPPORTED_VSCODE_TARGETS) {
		console.log(`- ${getVsixOutputPath(version, target)}`);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:vsix failed: ${message}`);
	process.exit(1);
});
