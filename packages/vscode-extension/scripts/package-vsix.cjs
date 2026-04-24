const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");

const extensionDir = path.resolve(__dirname, "..");
const distDir = path.join(extensionDir, "dist");
const stageDir = path.join(extensionDir, ".vsix-stage");
const extensionPackageJsonPath = path.join(extensionDir, "package.json");
const repoRoot = path.resolve(extensionDir, "..", "..");
const lspPublishDir = path.join(repoRoot, "packages", "lsp", ".npm", "publish");
const lspPublishPackageJsonPath = path.join(lspPublishDir, "package.json");
const sourceWrapperPath = path.join(
	repoRoot,
	"packages",
	"lsp",
	"bin",
	"vela-rbxts-lsp.js",
);

function assertExists(targetPath, message) {
	if (!fs.existsSync(targetPath)) {
		throw new Error(message);
	}
}

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

	fs.mkdirSync(path.join(stageDir, "node_modules"), { recursive: true });
}

function copyPackageIntoStage(packageName, packageDirectory) {
	const packageTarget = path.join(stageDir, "node_modules", ...packageName.split("/"));
	fs.rmSync(packageTarget, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(packageTarget), { recursive: true });
	fs.cpSync(packageDirectory, packageTarget, { recursive: true });
}

function resolvePackageJsonPathFromModule(packageRequire, moduleName) {
	try {
		return packageRequire.resolve(`${moduleName}/package.json`);
	} catch (error) {
		const resolvedModulePath = packageRequire.resolve(moduleName);
		let currentDir = path.dirname(resolvedModulePath);

		while (currentDir !== path.dirname(currentDir)) {
			const candidate = path.join(currentDir, "package.json");
			if (fs.existsSync(candidate)) {
				return candidate;
			}
			currentDir = path.dirname(currentDir);
		}

		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to locate package.json for dependency ${moduleName}. Original error: ${message}`,
		);
	}
}

function stageRuntimeDependencyTree(rootPackageName) {
	const extensionRequire = createRequire(extensionPackageJsonPath);
	const visited = new Set();

	function visit(packageJsonPath) {
		const normalizedPackageJsonPath = path.resolve(packageJsonPath);
		if (visited.has(normalizedPackageJsonPath)) {
			return;
		}
		visited.add(normalizedPackageJsonPath);

		const packageRequire = createRequire(packageJsonPath);
		const packageDirectory = path.dirname(packageJsonPath);
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
		if (typeof packageJson.name !== "string") {
			throw new Error(
				`Invalid package metadata at ${packageJsonPath}: missing package name.`,
			);
		}

		copyPackageIntoStage(packageJson.name, packageDirectory);
		for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
			const dependencyPackageJsonPath = resolvePackageJsonPathFromModule(
				packageRequire,
				dependencyName,
			);
			visit(dependencyPackageJsonPath);
		}
	}

	visit(resolvePackageJsonPathFromModule(extensionRequire, rootPackageName));
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
	assertExists(
		sourceWrapperPath,
		`Missing wrapper launcher at ${sourceWrapperPath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
	);

	assertExists(
		lspPublishPackageJsonPath,
		`Missing staged wrapper package metadata at ${lspPublishPackageJsonPath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
	);

	const publishedLspPackageJson = JSON.parse(
		fs.readFileSync(lspPublishPackageJsonPath, "utf8"),
	);
	const lspVersion = String(publishedLspPackageJson.version ?? "0.1.0");
	prepareManifest(lspVersion);

	const scopedDir = path.join(stageDir, "node_modules", "@vela-rbxts");
	fs.mkdirSync(scopedDir, { recursive: true });

	const stagedWrapperTarget = path.join(scopedDir, "lsp");
	fs.rmSync(stagedWrapperTarget, { recursive: true, force: true });
	fs.mkdirSync(path.join(stagedWrapperTarget, "bin"), { recursive: true });

	for (const fileName of ["package.json", "README.md"]) {
		const sourcePath = path.join(lspPublishDir, fileName);
		assertExists(
			sourcePath,
			`Missing staged wrapper file at ${sourcePath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
		);
		fs.copyFileSync(sourcePath, path.join(stagedWrapperTarget, fileName));
	}

	fs.copyFileSync(
		path.join(lspPublishDir, "bin", "vela-rbxts-lsp.js"),
		path.join(stagedWrapperTarget, "bin", "vela-rbxts-lsp.js"),
	);

	const platformFolder = resolvePlatformFolder();
	if (!platformFolder) {
		throw new Error(
			`No local platform binary package mapping for ${process.platform}/${process.arch}. Add platform mapping support before packaging this extension.`,
		);
	}

	const platformPackagePath = path.join(lspPublishDir, "npm", platformFolder);
	if (!fs.existsSync(platformPackagePath)) {
		throw new Error(
			`Missing staged platform package at ${platformPackagePath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
		);
	}

	const platformPackageJson = JSON.parse(
		fs.readFileSync(path.join(platformPackagePath, "package.json"), "utf8"),
	);
	const platformPackageName = String(platformPackageJson.name ?? "");
	if (!platformPackageName.startsWith("@vela-rbxts/")) {
		throw new Error(
			`Unexpected platform package name ${platformPackageName} in ${platformPackagePath}. Expected a package scoped as @vela-rbxts/<platform>.
Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
		);
	}

	const platformPackageShortName = platformPackageName.slice("@vela-rbxts/".length);
	const platformPackageTarget = path.join(scopedDir, platformPackageShortName);
	fs.rmSync(platformPackageTarget, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(platformPackageTarget), { recursive: true });
	fs.cpSync(platformPackagePath, platformPackageTarget, { recursive: true });

	return {
		platformPackageName,
		platformPackageTarget,
	};
}

function verifyStagedArtifacts({ platformPackageName, platformPackageTarget }) {
	const wrapperLauncherPath = path.join(
		stageDir,
		"node_modules",
		"@vela-rbxts",
		"lsp",
		"bin",
		"vela-rbxts-lsp.js",
	);
	assertExists(
		wrapperLauncherPath,
		`Missing staged wrapper launcher at ${wrapperLauncherPath}.`,
	);

	const stagePackageJsonPath = path.join(stageDir, "package.json");
	const stageRequire = createRequire(stagePackageJsonPath);
	const normalizedStageDir = path.resolve(stageDir);

	function assertWithinStage(resolvedPath, description) {
		const normalizedResolvedPath = path.resolve(resolvedPath);
		const relativeToStage = path.relative(
			normalizedStageDir,
			normalizedResolvedPath,
		);
		if (relativeToStage.startsWith("..") || path.isAbsolute(relativeToStage)) {
			throw new Error(
				`${description} resolved outside staged extension: ${resolvedPath}`,
			);
		}
	}

	let resolvedWrapperPath;
	try {
		resolvedWrapperPath = stageRequire.resolve("@vela-rbxts/lsp");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed resolving @vela-rbxts/lsp from staged extension: ${message}`,
		);
	}
	assertWithinStage(resolvedWrapperPath, "@vela-rbxts/lsp");

	let resolvedPlatformPackageJsonPath;
	try {
		resolvedPlatformPackageJsonPath = stageRequire.resolve(
			`${platformPackageName}/package.json`,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed resolving ${platformPackageName}/package.json from staged extension: ${message}`,
		);
	}
	assertWithinStage(
		resolvedPlatformPackageJsonPath,
		`${platformPackageName}/package.json`,
	);

	const runtimeClientPath = stageRequire.resolve("vscode-languageclient/node");
	const runtimeClientPackageJsonPath = stageRequire.resolve(
		"vscode-languageclient/package.json",
	);
	assertWithinStage(runtimeClientPath, "vscode-languageclient/node");
	assertWithinStage(
		runtimeClientPackageJsonPath,
		"vscode-languageclient/package.json",
	);

	const platformPackageJson = JSON.parse(
		fs.readFileSync(resolvedPlatformPackageJsonPath, "utf8"),
	);
	const binEntry =
		typeof platformPackageJson.bin === "string"
			? platformPackageJson.bin
			: platformPackageJson.bin?.["vela-rbxts-lsp"];
	if (typeof binEntry !== "string") {
		throw new Error(
			`Invalid or missing binary entry in ${resolvedPlatformPackageJsonPath}.`,
		);
	}

	const nativeBinaryPath = path.resolve(path.dirname(resolvedPlatformPackageJsonPath), binEntry);
	assertExists(
		nativeBinaryPath,
		`Missing staged native LSP binary at ${nativeBinaryPath}.`,
	);
	assertWithinStage(nativeBinaryPath, `${platformPackageName} binary`);

	if (process.platform !== "win32") {
		try {
			fs.accessSync(nativeBinaryPath, fs.constants.X_OK);
		} catch {
			throw new Error(
				`Native LSP binary is not executable: ${nativeBinaryPath}`,
			);
		}
	}

	console.log(`Staged wrapper resolved to: ${resolvedWrapperPath}`);
	console.log(
		`Staged platform package resolved to: ${resolvedPlatformPackageJsonPath}`,
	);
	console.log(`Staged native binary path: ${nativeBinaryPath}`);
	console.log(`Resolved vscode-languageclient runtime entry: ${runtimeClientPath}`);
	console.log(
		`Resolved vscode-languageclient package metadata: ${runtimeClientPackageJsonPath}`,
	);
	console.log(`Verified staged platform folder: ${platformPackageTarget}`);
}

function main() {
	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.mkdirSync(distDir, { recursive: true });

	run("pnpm", ["--filter", "@vela-rbxts/lsp", "stage:lsp"], repoRoot);
	copyRequiredFiles();
	stageRuntimeDependencyTree("vscode-languageclient");
	const stagedLsp = stageLspPackages();
	verifyStagedArtifacts(stagedLsp);

	const outputPath = path.join(distDir, "vela-rbxts-lsp-0.1.0.vsix");
	run(
		"pnpm",
		[
			"exec",
			"vsce",
			"package",
			"--allow-missing-repository",
			"--out",
			outputPath,
		],
		stageDir,
	);
	fs.rmSync(stageDir, { recursive: true, force: true });
}

main();
