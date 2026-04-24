import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { WORKSPACE_PUBLISH_ORDER } from "./release-config";

const TEMP_ROOT_PREFIX = "vela-rbxts-release-";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

async function main() {
	const publishArgs = buildPublishArgs(process.argv.slice(2));
	const npmCommand = resolveNpmCommand();
	const tempRoot = await mkdtemp(join(tmpdir(), TEMP_ROOT_PREFIX));
	const npmCacheDir = join(tempRoot, ".npm-cache");
	await mkdir(npmCacheDir, { recursive: true });

	try {
		for (const packageName of WORKSPACE_PUBLISH_ORDER) {
			const packageDir = join(tempRoot, sanitizePackageName(packageName));
			await mkdir(packageDir, { recursive: true });

			runCommand("pnpm", [
				"--filter",
				packageName,
				"pack",
				"--pack-destination",
				packageDir,
			]);

			const tarballPath = await getSingleTarballPath(packageDir, packageName);
			runCommand(npmCommand, ["publish", tarballPath, ...publishArgs], {
				env: {
					...process.env,
					NPM_CONFIG_CACHE: npmCacheDir,
					npm_config_cache: npmCacheDir,
				},
			});
			console.log(`Published ${packageName} from ${tarballPath}`);
		}
	} finally {
		await rm(tempRoot, { force: true, recursive: true });
	}
}

function buildPublishArgs(rawArgs: string[]) {
	const passthroughArgs = rawArgs.filter((arg) => arg !== "--");
	const hasAccessArg = passthroughArgs.some(
		(arg) => arg === "--access" || arg.startsWith("--access="),
	);

	if (!hasAccessArg) {
		passthroughArgs.push("--access", "public");
	}

	return passthroughArgs;
}

async function getSingleTarballPath(packageDir: string, packageName: string) {
	const entries = await readdir(packageDir, { withFileTypes: true });
	const tarballs = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
		.map((entry) => join(packageDir, entry.name));

	if (tarballs.length !== 1) {
		throw new Error(
			`Expected exactly one .tgz for ${packageName} in ${packageDir}, found ${tarballs.length}.`,
		);
	}

	return tarballs[0];
}

function runCommand(
	command: string,
	args: string[],
	options?: {
		env?: NodeJS.ProcessEnv;
	},
) {
	const result = spawnSync(command, args, {
		stdio: "inherit",
		env: options?.env ?? process.env,
		cwd: REPO_ROOT,
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

function sanitizePackageName(packageName: string) {
	return packageName.replace(/[@/]/g, "_");
}

function resolveNpmCommand() {
	const commandName = process.platform === "win32" ? "npm.cmd" : "npm";
	const localCommand = join(dirname(process.execPath), commandName);

	if (existsSync(localCommand)) {
		return localCommand;
	}

	return commandName;
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Workspace publish failed: ${message}`);
	process.exit(1);
});
