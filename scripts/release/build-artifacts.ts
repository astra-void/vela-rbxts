import { cp, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import { getFlagValue, parseDryRunFlag } from "./release-config";
import { runCommand } from "./utils/exec";
import {
	ARTIFACT_DIRS,
	cleanDir,
	ensureArtifactDirs,
	exists,
	REPO_ROOT,
	readJsonFile,
	writeJsonFile,
} from "./utils/fs";
import { type PackageJson } from "./utils/package-json";

type BuildRecord = {
	kind: "workspace" | "compiler" | "lsp";
	target?: string;
	output: string;
};

function getRepeatedFlagValues(rawArgs: readonly string[], flagName: string) {
	const values: string[] = [];
	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];
		if (arg === flagName) {
			const value = rawArgs[index + 1];
			if (value) {
				values.push(value);
			}
			index += 1;
			continue;
		}

		const prefix = `${flagName}=`;
		if (arg.startsWith(prefix)) {
			values.push(arg.slice(prefix.length));
		}
	}
	return values;
}

function resolveCompilerTargets(
	compilerManifest: PackageJson,
	overrides: readonly string[],
) {
	const configured = compilerManifest.napi?.targets ?? [];
	if (configured.length === 0) {
		throw new Error("@vela-rbxts/compiler napi.targets is empty.");
	}
	if (overrides.length === 0) {
		return configured;
	}
	for (const target of overrides) {
		if (!configured.includes(target)) {
			throw new Error(`Unknown compiler target override: ${target}`);
		}
	}
	return overrides;
}

async function resolveLspTargets(overrides: readonly string[]) {
	const packageConfigUrl = pathToFileURL(
		join(REPO_ROOT, "packages/lsp/scripts/package-config.mjs"),
	).href;
	const packageConfig = (await import(packageConfigUrl)) as {
		BINARY_PACKAGE_CONFIGS: Array<{ target: string; os: string }>;
		getBinaryFileName: (os: string) => string;
	};

	const configured = packageConfig.BINARY_PACKAGE_CONFIGS.map((entry) => entry.target);
	if (overrides.length === 0) {
		return {
			targets: configured,
			getBinaryFileName: packageConfig.getBinaryFileName,
			configs: packageConfig.BINARY_PACKAGE_CONFIGS,
		};
	}

	for (const target of overrides) {
		if (!configured.includes(target)) {
			throw new Error(`Unknown LSP target override: ${target}`);
		}
	}

	return {
		targets: overrides,
		getBinaryFileName: packageConfig.getBinaryFileName,
		configs: packageConfig.BINARY_PACKAGE_CONFIGS.filter((entry) =>
			overrides.includes(entry.target),
		),
	};
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const dryRun = parseDryRunFlag(rawArgs);
	const nativeTargetsArg = getRepeatedFlagValues(rawArgs, "--native-target");
	const lspTargetsArg = getRepeatedFlagValues(rawArgs, "--lsp-target");
	const skipWorkspaceBuild = getFlagValue(rawArgs, "--skip-workspace") === "true";
	const buildAllTargets = nativeTargetsArg.length === 0 && lspTargetsArg.length === 0;

	const compilerManifest = await readJsonFile<PackageJson>(
		join(REPO_ROOT, "packages/compiler/package.json"),
	);
	const compilerTargets = nativeTargetsArg.length > 0 || buildAllTargets
		? resolveCompilerTargets(compilerManifest, nativeTargetsArg)
		: [];
	const lspConfig = lspTargetsArg.length > 0 || buildAllTargets
		? await resolveLspTargets(lspTargetsArg)
		: null;

	if (!dryRun) {
		await ensureArtifactDirs();
		await cleanDir(ARTIFACT_DIRS.native);
		await cleanDir(ARTIFACT_DIRS.lsp);
		await cleanDir(ARTIFACT_DIRS.logs);
	}

	const buildRecords: BuildRecord[] = [];

	if (!skipWorkspaceBuild) {
		const workspaceBuildPackages = [
			"@vela-rbxts/types",
			"@vela-rbxts/config",
			"@vela-rbxts/ir",
			"@vela-rbxts/core",
			"@vela-rbxts/runtime",
			"@vela-rbxts/rbxtsc-host",
			"vela-rbxts",
			"vela-rbxts-lsp",
		];

		for (const packageName of workspaceBuildPackages) {
			if (dryRun) {
				console.log(`[dry-run] pnpm --filter ${packageName} run build`);
				continue;
			}

			runCommand("pnpm", ["--filter", packageName, "run", "build"], {
				cwd: REPO_ROOT,
			});
			buildRecords.push({
				kind: "workspace",
				output: `built ${packageName}`,
			});
		}
	}

	for (const target of compilerTargets) {
		const args = [
			"--filter",
			"@vela-rbxts/compiler",
			"run",
			"build:native:target",
			"--",
			"--target",
			target,
		];
		if (target === "aarch64-unknown-linux-gnu") {
			args.push("--cross-compile");
		}

		if (dryRun) {
			console.log(`[dry-run] pnpm ${args.join(" ")}`);
			continue;
		}

		runCommand("pnpm", args, { cwd: REPO_ROOT });
		const artifactFileName = `compiler.${target}.node`;
		const sourcePath = join(REPO_ROOT, "packages/compiler/artifacts", artifactFileName);
		if (!exists(sourcePath)) {
			throw new Error(`Missing expected compiler artifact: ${sourcePath}`);
		}

		const destinationPath = join(ARTIFACT_DIRS.native, artifactFileName);
		await cp(sourcePath, destinationPath);
		buildRecords.push({ kind: "compiler", target, output: destinationPath });
	}

	if (lspConfig) {
		for (const config of lspConfig.configs) {
			const args = [
				"--filter",
				"@vela-rbxts/lsp",
				"run",
				"build:lsp:target",
				"--",
				"--target",
				config.target,
			];

			if (dryRun) {
				console.log(`[dry-run] pnpm ${args.join(" ")}`);
				continue;
			}

			runCommand("pnpm", args, { cwd: REPO_ROOT });
			const binaryFileName = lspConfig.getBinaryFileName(config.os);
			const sourcePath = join(
				REPO_ROOT,
				"packages/lsp/artifacts",
				config.target,
				binaryFileName,
			);
			if (!exists(sourcePath)) {
				throw new Error(`Missing expected LSP artifact: ${sourcePath}`);
			}

			const destinationDir = join(ARTIFACT_DIRS.lsp, config.target);
			await cleanDir(destinationDir);
			const destinationPath = join(destinationDir, basename(sourcePath));
			await cp(sourcePath, destinationPath);
			buildRecords.push({ kind: "lsp", target: config.target, output: destinationPath });
		}
	}

	if (!dryRun) {
		const nativeFiles = (await readdir(ARTIFACT_DIRS.native)).sort();
		if (nativeFiles.length !== compilerTargets.length) {
			throw new Error(
				`Expected ${compilerTargets.length} compiler native artifacts but found ${nativeFiles.length}.`,
			);
		}

		if (lspConfig) {
			const lspTargetDirs = (await readdir(ARTIFACT_DIRS.lsp, { withFileTypes: true }))
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.sort();
			if (lspTargetDirs.length !== lspConfig.targets.length) {
				throw new Error(
					`Expected ${lspConfig.targets.length} LSP target directories but found ${lspTargetDirs.length}.`,
				);
			}
		}

		await writeJsonFile(join(ARTIFACT_DIRS.logs, "build-manifest.json"), {
			createdAt: new Date().toISOString(),
			buildRecords,
		});
	}

	console.log("Build phase completed.");
	for (const record of buildRecords) {
		console.log(`- ${record.kind}${record.target ? ` (${record.target})` : ""}: ${record.output}`);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:build failed: ${message}`);
	process.exit(1);
});
