const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const extensionDir = path.resolve(__dirname, "..");
const distDir = path.join(extensionDir, "dist");
const stageDir = path.join(extensionDir, ".vsix-stage");
const repoRoot = path.resolve(extensionDir, "..", "..");
const lspPublishDir = path.join(repoRoot, "packages", "lsp", ".npm", "publish");
const lspPublishPackageJsonPath = path.join(lspPublishDir, "package.json");

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		env: process.env,
		shell: process.platform === "win32",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

function detectLinuxRuntimeKind() {
	if (typeof process.report?.getReport !== "function") {
		return "musl";
	}

	const report = process.report.getReport();
	return report?.header?.glibcVersionRuntime ? "gnu" : "musl";
}

function resolvePlatformFolder() {
	if (process.platform === "darwin") {
		if (process.arch === "arm64") {
			return "darwin-arm64";
		}

		if (process.arch === "x64") {
			return "darwin-x64";
		}

		return undefined;
	}

	if (process.platform === "linux") {
		const runtimeKind = detectLinuxRuntimeKind();
		if (process.arch === "arm64") {
			return `linux-arm64-${runtimeKind}`;
		}

		if (process.arch === "x64") {
			return `linux-x64-${runtimeKind}`;
		}

		return undefined;
	}

	if (process.platform === "win32") {
		if (process.arch === "arm64") {
			return "win32-arm64-msvc";
		}

		if (process.arch === "x64") {
			return "win32-x64-msvc";
		}

		return undefined;
	}

	return undefined;
}

function copyRequiredFiles() {
	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.mkdirSync(stageDir, { recursive: true });

	for (const fileName of ["README.md", "LICENSE", ".vscodeignore"]) {
		const sourcePath = path.join(extensionDir, fileName);
		if (fs.existsSync(sourcePath)) {
			fs.cpSync(sourcePath, path.join(stageDir, fileName));
		}
	}

	fs.cpSync(path.join(extensionDir, "dist"), path.join(stageDir, "dist"), {
		recursive: true,
	});

	fs.cpSync(
		path.join(extensionDir, "node_modules"),
		path.join(stageDir, "node_modules"),
		{ recursive: true },
	);
}

function prepareManifest(lspVersion) {
	const extensionPackageJsonPath = path.join(extensionDir, "package.json");
	const extensionPackageJson = JSON.parse(
		fs.readFileSync(extensionPackageJsonPath, "utf8"),
	);

	const stagePackageJson = {
		...extensionPackageJson,
		private: false,
		scripts: {
			...extensionPackageJson.scripts,
		},
		dependencies: {
			...extensionPackageJson.dependencies,
			"@vela-rbxts/lsp": lspVersion,
		},
	};

	if (stagePackageJson.scripts) {
		delete stagePackageJson.scripts["vscode:prepublish"];
	}

	for (const [dependencyName, versionRange] of Object.entries(
		stagePackageJson.dependencies ?? {},
	)) {
		if (versionRange === "workspace:*") {
			stagePackageJson.dependencies[dependencyName] = lspVersion;
		}
	}

	fs.writeFileSync(
		path.join(stageDir, "package.json"),
		`${JSON.stringify(stagePackageJson, null, 2)}\n`,
	);
}

function stageLspPackages() {
	const publishedLspPackageJson = JSON.parse(
		fs.readFileSync(lspPublishPackageJsonPath, "utf8"),
	);
	const lspVersion = String(publishedLspPackageJson.version ?? "0.1.0");
	prepareManifest(lspVersion);

	const scopedDir = path.join(stageDir, "node_modules", "@vela-rbxts");
	fs.mkdirSync(scopedDir, { recursive: true });

	const stagedWrapperTarget = path.join(scopedDir, "lsp");
	fs.rmSync(stagedWrapperTarget, { recursive: true, force: true });
	fs.cpSync(lspPublishDir, stagedWrapperTarget, { recursive: true });

	const platformFolder = resolvePlatformFolder();
	if (!platformFolder) {
		console.warn(
			`No local platform binary package mapping for ${process.platform}/${process.arch}. Packaging continues without a staged platform binary package.`,
		);
		return;
	}

	const platformPackagePath = path.join(lspPublishDir, "npm", platformFolder);
	if (!fs.existsSync(platformPackagePath)) {
		console.warn(
			`Missing staged platform package at ${platformPackagePath}. Packaging continues without it.`,
		);
		return;
	}

	const platformPackageJson = JSON.parse(
		fs.readFileSync(path.join(platformPackagePath, "package.json"), "utf8"),
	);
	const platformPackageName = String(platformPackageJson.name ?? "");
	if (!platformPackageName.startsWith("@vela-rbxts/")) {
		console.warn(
			`Unexpected platform package name ${platformPackageName}. Packaging continues without staged platform package installation.`,
		);
		return;
	}

	const platformPackageShortName = platformPackageName.slice("@vela-rbxts/".length);
	const platformPackageTarget = path.join(scopedDir, platformPackageShortName);
	fs.rmSync(platformPackageTarget, { recursive: true, force: true });
	fs.cpSync(platformPackagePath, platformPackageTarget, { recursive: true });
}

function main() {
	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.mkdirSync(distDir, { recursive: true });

	run("pnpm", ["--filter", "@vela-rbxts/lsp", "stage:lsp"], repoRoot);
	copyRequiredFiles();
	stageLspPackages();

	const outputPath = path.join(distDir, "vela-rbxts-lsp-0.1.0.vsix");
	run(
		"pnpm",
		[
			"exec",
			"vsce",
			"package",
			"--no-dependencies",
			"--allow-missing-repository",
			"--out",
			outputPath,
		],
		stageDir,
	);
	fs.rmSync(stageDir, { recursive: true, force: true });
}

main();
