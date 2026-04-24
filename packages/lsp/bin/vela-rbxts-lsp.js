#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { spawn } = require("node:child_process");
const { dirname, join } = require("node:path");

const BINARY_PACKAGES = {
	darwin: {
		arm64: "@vela-rbxts/lsp-darwin-arm64",
		x64: "@vela-rbxts/lsp-darwin-x64",
	},
	linux: {
		arm64: {
			gnu: "@vela-rbxts/lsp-linux-arm64-gnu",
			musl: "@vela-rbxts/lsp-linux-arm64-musl",
		},
		x64: {
			gnu: "@vela-rbxts/lsp-linux-x64-gnu",
			musl: "@vela-rbxts/lsp-linux-x64-musl",
		},
	},
	win32: {
		arm64: "@vela-rbxts/lsp-win32-arm64-msvc",
		x64: "@vela-rbxts/lsp-win32-x64-msvc",
	},
};

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});

async function main() {
	const runtimePackageName = resolveBinaryPackageName();
	const runtimePackageDir = resolveInstalledPackageDirectory(runtimePackageName);
	const runtimePackageJson = readPackageJson(
		join(runtimePackageDir, "package.json"),
	);
	const runtimeBinaryPath = resolveBinaryPath(
		runtimePackageDir,
		runtimePackageJson,
	);

	const child = spawn(runtimeBinaryPath, process.argv.slice(2), {
		cwd: process.cwd(),
		stdio: "inherit",
	});

	child.on("error", (error) => {
		const childMessage =
			error instanceof Error ? error.message : String(error);
		console.error(
			`Failed to launch @vela-rbxts/lsp native binary from ${runtimePackageName}. Original error: ${childMessage}`,
		);
		process.exit(1);
	});

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}

		process.exit(code ?? 1);
	});
}

function resolveBinaryPackageName() {
	const platformPackages = BINARY_PACKAGES[process.platform];
	if (!platformPackages) {
		throw new Error(
			`Unsupported platform for @vela-rbxts/lsp: ${process.platform}`,
		);
	}

	const packageEntry = platformPackages[process.arch];
	if (!packageEntry) {
		throw new Error(
			`Unsupported architecture for @vela-rbxts/lsp on ${process.platform}: ${process.arch}`,
		);
	}

	if (typeof packageEntry === "string") {
		return packageEntry;
	}

	return detectLinuxRuntimeKind() === "gnu" ? packageEntry.gnu : packageEntry.musl;
}

function resolveInstalledPackageDirectory(packageName) {
	try {
		const packageJsonPath = require.resolve(`${packageName}/package.json`);
		return dirname(packageJsonPath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Missing prebuilt package ${packageName}. Install @vela-rbxts/lsp with its optional dependencies intact. Original error: ${message}`,
		);
	}
}

function readPackageJson(packageJsonPath) {
	return JSON.parse(readFileSync(packageJsonPath, "utf8"));
}

function resolveBinaryPath(packageDir, packageJson) {
	const binaryPath = resolveDefaultBinaryPath(packageJson);

	if (!binaryPath) {
		throw new Error(
			`The package ${packageJson.name} does not declare a runnable binary path.`,
		);
	}

	return join(packageDir, binaryPath);
}

function resolveDefaultBinaryPath(packageJson) {
	if (typeof packageJson.bin === "string") {
		return packageJson.bin;
	}

	if (
		packageJson.bin &&
		typeof packageJson.bin === "object" &&
		typeof packageJson.bin["vela-rbxts-lsp"] === "string"
	) {
		return packageJson.bin["vela-rbxts-lsp"];
	}

	return null;
}

function detectLinuxRuntimeKind() {
	const glibcVersionRuntime =
		typeof process.report?.getReport === "function"
			? process.report.getReport().header?.glibcVersionRuntime
			: undefined;

	return glibcVersionRuntime ? "gnu" : "musl";
}
