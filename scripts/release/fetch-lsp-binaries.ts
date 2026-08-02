import { chmodSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { getFlagValue } from "./release-config";
import { runCommand } from "./utils/exec";
import {
	ARTIFACT_DIRS,
	cleanDir,
	copyFileOrDir,
	ensureDir,
	exists,
	REPO_ROOT,
	readJsonFile,
} from "./utils/fs";
import { resolveNpmCommand } from "./utils/npm";

type LspPackageConfig = {
	BINARY_PACKAGE_CONFIGS: Array<{
		directory: string;
		name: string;
		os: string;
		target: string;
	}>;
	getBinaryFileName: (os: string) => string;
};

async function resolveVersion(rawArgs: readonly string[]) {
	const explicitVersion = getFlagValue(rawArgs, "--version")?.trim();
	if (explicitVersion) {
		return explicitVersion.replace(/^v/, "");
	}

	const rootManifest = await readJsonFile<{ version?: string }>(
		join(REPO_ROOT, "package.json"),
	);
	const version = rootManifest.version?.trim();
	if (!version) {
		throw new Error(
			"The root package.json has no version to fetch LSP binaries for.",
		);
	}

	return version;
}

async function extractTarball(tarballPath: string, destinationDir: string) {
	await ensureDir(destinationDir);
	runCommand("tar", ["-xzf", tarballPath, "-C", destinationDir]);
}

async function findTarball(directory: string) {
	const entries = await readdir(directory);
	const tarball = entries.find((entry) => entry.endsWith(".tgz"));
	if (!tarball) {
		throw new Error(`npm pack produced no tarball in ${directory}.`);
	}

	return join(directory, tarball);
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const version = await resolveVersion(rawArgs);
	const npmCommand = resolveNpmCommand();

	const lspPackageConfig = (await import(
		pathToFileURL(join(REPO_ROOT, "packages/lsp/scripts/package-config.mjs"))
			.href
	)) as LspPackageConfig;

	await cleanDir(ARTIFACT_DIRS.lsp);
	const workDir = join(tmpdir(), `vela-lsp-binaries-${process.pid}`);
	await cleanDir(workDir);

	console.log(`Fetching published LSP binaries for ${version}.`);

	for (const config of lspPackageConfig.BINARY_PACKAGE_CONFIGS) {
		const packageDir = join(workDir, config.directory);
		await cleanDir(packageDir);

		runCommand(
			npmCommand,
			["pack", `${config.name}@${version}`, "--pack-destination", packageDir],
			{ cwd: REPO_ROOT },
		);

		const tarballPath = await findTarball(packageDir);
		await extractTarball(tarballPath, packageDir);

		const binaryFileName = lspPackageConfig.getBinaryFileName(config.os);
		const packedBinaryPath = join(packageDir, "package", "bin", binaryFileName);
		if (!exists(packedBinaryPath)) {
			throw new Error(
				`${config.name}@${version} does not carry bin/${binaryFileName}; the published package is not usable for the VSIX.`,
			);
		}

		const destinationPath = join(
			ARTIFACT_DIRS.lsp,
			config.target,
			binaryFileName,
		);
		await copyFileOrDir(packedBinaryPath, destinationPath);
		if (config.os !== "win32") {
			// npm pack preserves the mode, but a tarball unpacked by another tool
			// upstream would not, and vsce ships whatever mode it finds.
			chmodSync(destinationPath, 0o755);
		}

		console.log(
			`- ${config.name}@${version} -> artifacts/lsp/${config.target}/${binaryFileName}`,
		);
	}

	await cleanDir(workDir);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:lsp:fetch failed: ${message}`);
	process.exit(1);
});
