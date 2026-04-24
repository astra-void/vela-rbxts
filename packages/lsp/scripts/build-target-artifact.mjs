import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { BINARY_PACKAGE_CONFIGS, getBinaryFileName } from "./package-config.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const ARTIFACTS_DIR = join(PACKAGE_DIR, "artifacts");

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const config = BINARY_PACKAGE_CONFIGS.find((entry) => entry.target === options.target);

	if (!config) {
		throw new Error(
			`Unknown target \"${options.target}\". Ensure it exists in BINARY_PACKAGE_CONFIGS.`,
		);
	}

	const tempPackageDir = await mkdtemp(join(tmpdir(), "vela-rbxts-lsp-target-"));
	const binaryFileName = getBinaryFileName(config.os);

	try {
		runCommand(process.execPath, [
			join(SCRIPT_DIR, "package-binary.js"),
			"--package-dir",
			tempPackageDir,
			"--crate-dir",
			PACKAGE_DIR,
			"--variant",
			`${config.target}=bin/${binaryFileName}`,
		]);

		const sourcePath = join(tempPackageDir, "bin", binaryFileName);
		const targetDir = join(ARTIFACTS_DIR, config.target);
		await mkdir(targetDir, { recursive: true });
		const destinationPath = join(targetDir, binaryFileName);
		await cp(sourcePath, destinationPath);

		console.log(`Built and staged ${config.target} -> ${destinationPath}`);
	} finally {
		await rm(tempPackageDir, { force: true, recursive: true });
	}
}

function runCommand(command, args) {
	const result = spawnSync(command, args, {
		cwd: PACKAGE_DIR,
		env: process.env,
		stdio: "inherit",
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(
			`Command failed with exit code ${result.status ?? 1}: ${command} ${args.join(" ")}`,
		);
	}
}

function parseArgs(rawArgs) {
	let target;

	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];
		if (arg === "--") {
			continue;
		}

		if (arg === "--target") {
			target = rawArgs[index + 1];
			index += 1;
			continue;
		}

		if (arg.startsWith("--target=")) {
			target = arg.slice("--target=".length);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!target) {
		throw new Error("Missing --target <triple>.");
	}

	return { target };
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`LSP target artifact build failed: ${message}`);
	process.exit(1);
});
