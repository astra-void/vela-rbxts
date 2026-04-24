#!/usr/bin/env node
"use strict";

const { copyFileSync, mkdirSync, rmSync, chmodSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { homedir } = require("node:os");
const { spawnSync } = require("node:child_process");

const options = parseArgs(process.argv.slice(2));
const packageDir = resolve(options.packageDir);
const crateDir = resolve(options.crateDir);
const cargoManifestPath = join(crateDir, "Cargo.toml");
const packageBinDir = join(packageDir, "bin");
const cargoHome = process.env.CARGO_HOME ?? join(homedir(), ".cargo");

rmSync(packageBinDir, { force: true, recursive: true });

for (const variant of options.variants) {
	const { target, output } = variant;
	const useXwin = target.includes("windows");
	const command = useXwin ? getCargoXwinBinaryPath() : getCargoBinaryPath();
	const args = useXwin
		? [
				"xwin",
				"build",
				"--release",
				"--manifest-path",
				cargoManifestPath,
				"--target",
				target,
			]
		: [
				"zigbuild",
				"--release",
				"--manifest-path",
				cargoManifestPath,
				"--target",
				target,
			];
	const buildResult = spawnSync(
		command,
		args,
		{
			cwd: crateDir,
			env: buildEnvironment(),
			stdio: "inherit",
		},
	);

	if (buildResult.status !== 0) {
		process.exit(buildResult.status ?? 1);
	}

	const sourceFileName = `${options.binaryName}${
		target.includes("windows") ? ".exe" : ""
	}`;
	const sourcePath = join(crateDir, "target", target, "release", sourceFileName);
	const outputPath = join(packageDir, output);

	mkdirSync(dirname(outputPath), { recursive: true });
	copyFileSync(sourcePath, outputPath);
}

function getCargoBinaryPath() {
	return join(cargoHome, "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
}

function getCargoXwinBinaryPath() {
	return join(
		cargoHome,
		"bin",
		process.platform === "win32" ? "cargo-xwin.exe" : "cargo-xwin",
	);
}

function buildEnvironment() {
	const cargoBinDir = join(cargoHome, "bin");
	const pathSeparator = process.platform === "win32" ? ";" : ":";
	return {
		...process.env,
		CARGO_HOME: cargoHome,
		PATH: [cargoBinDir, process.env.PATH ?? ""].filter(Boolean).join(pathSeparator),
	};
}

if (process.platform !== "win32") {
	for (const variant of options.variants) {
		const outputPath = join(packageDir, variant.output);
		try {
			chmodSync(outputPath, 0o755);
		} catch {
			// Ignore chmod failures on filesystems that do not support it.
		}
	}
}

function parseArgs(rawArgs) {
	const options = {
		binaryName: "vela-rbxts-lsp",
		crateDir: "../lsp",
		packageDir: ".",
		variants: [],
	};

	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];

		if (arg === "--package-dir") {
			options.packageDir = requireValue(rawArgs, ++index, arg);
			continue;
		}

		if (arg === "--crate-dir") {
			options.crateDir = requireValue(rawArgs, ++index, arg);
			continue;
		}

		if (arg === "--binary-name") {
			options.binaryName = requireValue(rawArgs, ++index, arg);
			continue;
		}

		if (arg === "--variant") {
			const value = requireValue(rawArgs, ++index, arg);
			const separatorIndex = value.indexOf("=");
			if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
				throw new Error(
					`Invalid variant "${value}". Expected --variant <target>=<output-path>.`,
				);
			}

			options.variants.push({
				output: value.slice(separatorIndex + 1),
				target: value.slice(0, separatorIndex),
			});
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (options.variants.length === 0) {
		throw new Error("At least one --variant must be provided.");
	}

	return options;
}

function requireValue(rawArgs, index, flag) {
	const value = rawArgs[index];
	if (!value) {
		throw new Error(`Missing value for ${flag}.`);
	}

	return value;
}
