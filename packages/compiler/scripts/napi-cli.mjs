import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const cliPackageJsonPath = require.resolve("@napi-rs/cli/package.json");
const cliPackageJson = require(cliPackageJsonPath);
const cliPath = join(dirname(cliPackageJsonPath), cliPackageJson.bin.napi);

export function getPassthroughArgs(argv = process.argv.slice(2)) {
	return argv[0] === "--" ? argv.slice(1) : argv;
}

function spawnAndCheck(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? process.cwd(),
		env: options.env ?? process.env,
		stdio: options.stdio ?? "inherit",
	});

	if (result.error) {
		throw result.error;
	}

	if (options.check !== false && result.status !== 0) {
		process.exit(result.status ?? 1);
	}

	return result;
}

export function runCommand(command, args, options = {}) {
	return spawnAndCheck(command, args, options);
}

export function runPnpm(args, options = {}) {
	const pnpmExecPath = process.env.npm_execpath;

	if (pnpmExecPath && process.platform !== "win32") {
		return spawnAndCheck(pnpmExecPath, args, options);
	}

	return spawnAndCheck("pnpm", args, options);
}

export function runNapi(args, options = {}) {
	return runCommand(process.execPath, [cliPath, ...args], options);
}

export function resolveNpmCommand() {
	const commandName = process.platform === "win32" ? "npm.cmd" : "npm";
	const localCommand = join(dirname(process.execPath), commandName);

	if (existsSync(localCommand)) {
		return localCommand;
	}

	return commandName;
}
