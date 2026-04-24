import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

import { BINARY_PACKAGE_CONFIGS, getBinaryFileName } from "./package-config.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const STAGE_ROOT = join(PACKAGE_DIR, ".npm", "publish");
const ARTIFACTS_ROOT = join(PACKAGE_DIR, "artifacts");

const options = parseArgs(process.argv.slice(2));
const lifecycleEvent = process.env.npm_lifecycle_event;

const shouldPrepareStage =
	options.prepareOnly ||
	lifecycleEvent === "prepublish:lsp" ||
	!lifecycleEvent;

const shouldPublishStage =
	!options.prepareOnly &&
	(lifecycleEvent === "publish:lsp" || !lifecycleEvent);

if (shouldPrepareStage) {
	await prepareStage(options.prepareOnly);
}

if (shouldPublishStage) {
	await publishStage(options.publishArgs, options.dryRun);
}

async function prepareStage(prepareOnly) {
	await runNodeScript("create-npm-dirs.mjs");

	for (const config of BINARY_PACKAGE_CONFIGS) {
		const artifactPath = join(
			ARTIFACTS_ROOT,
			config.target,
			getBinaryFileName(config.os),
		);
		const outputRelativePath = `bin/${getBinaryFileName(config.os)}`;
		const outputPath = join(STAGE_ROOT, "npm", config.directory, outputRelativePath);

		if (existsSync(artifactPath)) {
			await mkdir(dirname(outputPath), { recursive: true });
			await copyFile(artifactPath, outputPath);
			if (config.os !== "win32") {
				await chmod(outputPath, 0o755);
			}
			continue;
		}

		if (prepareOnly) {
			console.warn(`Skipping missing target artifact: ${config.target}`);
			continue;
		}

		throw new Error(
			`Missing required target artifact: ${config.target}. Expected file at ${artifactPath}.`,
		);
	}
}

async function publishStage(publishArgs, dryRun) {
	const npmCommand = resolveNpmCommand();
	const publishCommand = ["publish", ...publishArgs];
	if (!publishCommand.includes("--ignore-scripts")) {
		publishCommand.push("--ignore-scripts");
	}
	if (dryRun && !publishCommand.includes("--dry-run")) {
		publishCommand.push("--dry-run");
	}

	for (const config of BINARY_PACKAGE_CONFIGS) {
		await runCommand(npmCommand, publishCommand, {
			cwd: join(STAGE_ROOT, "npm", config.directory),
		});
	}

	await runCommand(npmCommand, publishCommand, {
		cwd: STAGE_ROOT,
	});
}

async function runNodeScript(scriptFileName, args = []) {
	await runCommand(process.execPath, [join(SCRIPT_DIR, scriptFileName), ...args], {
		cwd: PACKAGE_DIR,
	});
}

async function runCommand(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? PACKAGE_DIR,
		env: {
			...process.env,
			...(options.env ?? {}),
		},
		stdio: options.stdio ?? "inherit",
		shell: process.platform === "win32",
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function resolveNpmCommand() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function parseArgs(rawArgs) {
	const publishArgs = [];
	let dryRun = false;
	let prepareOnly = false;

	for (const arg of rawArgs) {
		if (arg === "--") {
			continue;
		}

		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}

		if (arg === "--prepare-only" || arg === "--stage-only") {
			prepareOnly = true;
			continue;
		}

		publishArgs.push(arg);
	}

	return {
		dryRun,
		prepareOnly,
		publishArgs,
	};
}
