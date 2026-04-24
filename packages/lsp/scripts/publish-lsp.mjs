import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { BINARY_PACKAGE_CONFIGS, getBinaryFileName } from "./package-config.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const STAGE_ROOT = join(PACKAGE_DIR, ".npm", "publish");

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
	await prepareStage();
}

if (shouldPublishStage) {
	await publishStage(options.publishArgs, options.dryRun);
}

async function prepareStage() {
	await runNodeScript("create-npm-dirs.mjs");

	for (const config of BINARY_PACKAGE_CONFIGS) {
		await runNodeScript("package-binary.js", [
			"--package-dir",
			join(STAGE_ROOT, "npm", config.directory),
			"--crate-dir",
			PACKAGE_DIR,
			"--variant",
			`${config.target}=bin/${getBinaryFileName(config.os)}`,
		]);
	}
}

async function publishStage(publishArgs, dryRun) {
	const publishCommand = ["publish", ...publishArgs];
	if (!publishCommand.includes("--ignore-scripts")) {
		publishCommand.push("--ignore-scripts");
	}
	if (dryRun && !publishCommand.includes("--dry-run")) {
		publishCommand.push("--dry-run");
	}

	for (const config of BINARY_PACKAGE_CONFIGS) {
		await runCommand("npm", publishCommand, {
			cwd: join(STAGE_ROOT, "npm", config.directory),
		});
	}

	await runCommand("npm", publishCommand, {
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
		env: options.env ?? process.env,
		stdio: options.stdio ?? "inherit",
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
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
