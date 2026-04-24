import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readNapiConfig } from "@napi-rs/cli";

import { runNapi } from "./napi-cli.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const ARTIFACTS_DIR = join(PACKAGE_DIR, "artifacts");

async function main() {
	const options = parseArgs(process.argv.slice(2));
	assertSupportedHostForTarget(options.target);
	const packageJsonPath = join(PACKAGE_DIR, "package.json");
	const { binaryName, targets } = await readNapiConfig(packageJsonPath);

	const targetConfig = targets.find((target) => target.triple === options.target);
	if (!targetConfig) {
		throw new Error(
			`Unknown target \"${options.target}\". Ensure it exists in package.json napi.targets.`,
		);
	}

	runNapi(["build", "--platform", "--target", options.target], {
		cwd: PACKAGE_DIR,
	});

	const sourceBinaryFileName = `${binaryName}.${targetConfig.platformArchABI}.node`;
	const sourcePath = join(PACKAGE_DIR, sourceBinaryFileName);
	if (!existsSync(sourcePath)) {
		throw new Error(
			`Expected built artifact ${sourceBinaryFileName} at ${sourcePath}, but it was not found.`,
		);
	}

	await mkdir(ARTIFACTS_DIR, { recursive: true });
	const stagedBinaryFileName = `${binaryName}.${options.target}.node`;
	const destinationPath = join(ARTIFACTS_DIR, stagedBinaryFileName);
	await cp(sourcePath, destinationPath);

	console.log(`Built ${sourceBinaryFileName} and staged ${stagedBinaryFileName}`);
	console.log(destinationPath);
}

function assertSupportedHostForTarget(target) {
	const isWindowsTarget = target.includes("windows");
	if (!isWindowsTarget) {
		return;
	}

	if (process.platform === "win32") {
		return;
	}

	throw new Error(
		`Cross-building ${target} from ${process.platform} is not supported by build-target-artifact.mjs. Use a Windows runner for Windows targets.`,
	);
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
	console.error(`Compiler target artifact build failed: ${message}`);
	process.exit(1);
});
