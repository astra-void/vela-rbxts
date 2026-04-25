const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawnSync } = require("node:child_process");
const {
	VSCODE_TARGETS,
	SUPPORTED_VSCODE_TARGETS,
	resolveDefaultVsCodeTarget,
} = require("./vsix-targets.cjs");

const extensionDir = path.resolve(__dirname, "..");
const distDir = path.join(extensionDir, "dist");
const stageDir = path.join(extensionDir, ".vsix-stage");
const extensionPackageJsonPath = path.join(extensionDir, "package.json");
const vsceBinaryPath = path.join(
	extensionDir,
	"node_modules",
	".bin",
	process.platform === "win32" ? "vsce.cmd" : "vsce",
);
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

function parseArgs(rawArgs) {
	let target;
	let outputPath;
	let dryRun = false;

	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];

		if (arg === "--dry-run") {
			dryRun = true;
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

		if (arg === "--out") {
			outputPath = rawArgs[index + 1];
			index += 1;
			continue;
		}

		if (arg.startsWith("--out=")) {
			outputPath = arg.slice("--out=".length);
			continue;
		}

		throw new Error(`Unsupported argument: ${arg}`);
	}

	return {
		target,
		outputPath,
		dryRun,
	};
}

function assertExists(targetPath, message) {
	if (!fs.existsSync(targetPath)) {
		throw new Error(message);
	}
}

function assertDirEntries(targetPath, requiredEntries, context) {
	const present = new Set(fs.readdirSync(targetPath));
	for (const required of requiredEntries) {
		if (!present.has(required)) {
			throw new Error(`Missing ${context} entry "${required}" in ${targetPath}.`);
		}
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
		throw new Error(
			`Command failed (${result.status ?? 1}): ${command} ${args.join(" ")}`,
		);
	}
}

function copyRequiredFiles() {
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

	return extensionPackageJson;
}

function stageLspPackages(target, targetConfig) {
	assertExists(
		sourceWrapperPath,
		`[${target}] Missing wrapper launcher at ${sourceWrapperPath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
	);

	assertExists(
		lspPublishPackageJsonPath,
		`[${target}] Missing staged wrapper package metadata at ${lspPublishPackageJsonPath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
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
			`[${target}] Missing staged wrapper file at ${sourcePath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
		);
		fs.copyFileSync(sourcePath, path.join(stagedWrapperTarget, fileName));
	}

	fs.copyFileSync(
		path.join(lspPublishDir, "bin", "vela-rbxts-lsp.js"),
		path.join(stagedWrapperTarget, "bin", "vela-rbxts-lsp.js"),
	);

	const platformPackagePath = path.join(
		lspPublishDir,
		"npm",
		targetConfig.lspFolder,
	);
	if (!fs.existsSync(platformPackagePath)) {
		throw new Error(
			`[${target}] Missing staged platform package ${targetConfig.packageName} at ${platformPackagePath}. Build/stage @vela-rbxts/lsp first (for example: pnpm --filter @vela-rbxts/lsp stage:lsp).`,
		);
	}

	const platformPackageJson = JSON.parse(
		fs.readFileSync(path.join(platformPackagePath, "package.json"), "utf8"),
	);
	const platformPackageName = String(platformPackageJson.name ?? "");
	if (platformPackageName !== targetConfig.packageName) {
		throw new Error(
			`[${target}] Unexpected platform package name ${platformPackageName} in ${platformPackagePath}. Expected ${targetConfig.packageName}.`,
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

function verifyStagedArtifacts(target, { platformPackageName, platformPackageTarget }) {
	const stagePackageJsonPath = path.join(stageDir, "package.json");
	const stageExtensionEntryPath = path.join(stageDir, "dist", "extension.js");
	const stagedRuntimeDependencyPath = path.join(
		stageDir,
		"node_modules",
		"vscode-languageclient",
	);
	const stagedWrapperPackageJsonPath = path.join(
		stageDir,
		"node_modules",
		"@vela-rbxts",
		"lsp",
		"package.json",
	);
	const platformPackageShortName = platformPackageName.slice("@vela-rbxts/".length);
	const stagedPlatformPackageJsonPath = path.join(
		stageDir,
		"node_modules",
		"@vela-rbxts",
		platformPackageShortName,
		"package.json",
	);

	assertExists(
		stagePackageJsonPath,
		`[${target}] Missing staged extension manifest at ${stagePackageJsonPath}.`,
	);
	assertExists(
		stageExtensionEntryPath,
		`[${target}] Missing staged extension bundle at ${stageExtensionEntryPath}. Build the extension first (for example: pnpm --filter ./packages/vscode-extension run build).`,
	);
	assertExists(
		stagedRuntimeDependencyPath,
		`[${target}] Missing staged runtime dependency tree at ${stagedRuntimeDependencyPath}.`,
	);
	assertExists(
		stagedWrapperPackageJsonPath,
		`[${target}] Missing staged @vela-rbxts/lsp package at ${stagedWrapperPackageJsonPath}.`,
	);
	assertExists(
		stagedPlatformPackageJsonPath,
		`[${target}] Missing staged platform package ${platformPackageName} at ${stagedPlatformPackageJsonPath}.`,
	);

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
		`[${target}] Missing staged wrapper launcher at ${wrapperLauncherPath}.`,
	);

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
				`[${target}] ${description} resolved outside staged extension: ${resolvedPath}`,
			);
		}
	}

	let resolvedWrapperPath;
	try {
		resolvedWrapperPath = stageRequire.resolve("@vela-rbxts/lsp");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`[${target}] Failed resolving @vela-rbxts/lsp from staged extension: ${message}`,
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
			`[${target}] Failed resolving ${platformPackageName}/package.json from staged extension: ${message}`,
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
			`[${target}] Invalid or missing binary entry in ${resolvedPlatformPackageJsonPath}.`,
		);
	}

	const nativeBinaryPath = path.resolve(path.dirname(resolvedPlatformPackageJsonPath), binEntry);
	assertExists(
		nativeBinaryPath,
		`[${target}] Missing staged native LSP binary at ${nativeBinaryPath}.`,
	);
	assertWithinStage(nativeBinaryPath, `${platformPackageName} binary`);

	if (!target.startsWith("win32-")) {
		const mode = fs.statSync(nativeBinaryPath).mode;
		if ((mode & 0o111) === 0) {
			throw new Error(
				`[${target}] Native LSP binary is missing execute permissions: ${nativeBinaryPath} (mode=${mode.toString(8)}).`,
			);
		}
	}

	const scopedPackagesDir = path.join(stageDir, "node_modules", "@vela-rbxts");
	assertDirEntries(scopedPackagesDir, ["lsp", platformPackageShortName], `@vela-rbxts packages for ${target}`);
	const unexpectedBinaryPackages = fs
		.readdirSync(scopedPackagesDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter(
			(packageShortName) =>
				packageShortName.startsWith("lsp-") &&
				`@vela-rbxts/${packageShortName}` !== platformPackageName,
		);

	if (unexpectedBinaryPackages.length > 0) {
		throw new Error(
			`[${target}] Staged unexpected platform binary packages: ${unexpectedBinaryPackages
				.map((name) => `@vela-rbxts/${name}`)
				.join(", ")}. Expected only ${platformPackageName}.`,
		);
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
	const { dryRun, outputPath, target: explicitTarget } = parseArgs(
		process.argv.slice(2),
	);
	const resolvedTarget = explicitTarget ?? resolveDefaultVsCodeTarget();
	if (!resolvedTarget) {
		throw new Error(
			`No default target mapping for local platform ${process.platform}/${process.arch}. Pass --target explicitly. Supported targets: ${SUPPORTED_VSCODE_TARGETS.join(", ")}`,
		);
	}

	const targetConfig = VSCODE_TARGETS[resolvedTarget];
	if (!targetConfig) {
		throw new Error(
			`Unsupported VS Code target "${resolvedTarget}". Supported targets: ${SUPPORTED_VSCODE_TARGETS.join(", ")}`,
		);
	}

	const extensionPackageJson = JSON.parse(
		fs.readFileSync(extensionPackageJsonPath, "utf8"),
	);
	const extensionVersion = String(extensionPackageJson.version ?? "0.1.0");
	const releaseTag = process.env.RELEASE_TAG?.trim() ?? "";
	const prerelease = releaseTag.includes("-") || extensionVersion.includes("-");

	const resolvedOutputPath = path.resolve(
		outputPath ??
			path.join(distDir, `vela-rbxts-lsp-${extensionVersion}-${resolvedTarget}.vsix`),
	);

	assertExists(
		path.join(distDir, "extension.js"),
		`Missing extension bundle at ${path.join(distDir, "extension.js")}. Build the extension first (for example: pnpm --filter ./packages/vscode-extension run build).`,
	);

	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.mkdirSync(stageDir, { recursive: true });
	fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });

	try {
		run("pnpm", ["--filter", "@vela-rbxts/lsp", "stage:lsp"], repoRoot);
		copyRequiredFiles();
		stageRuntimeDependencyTree("vscode-languageclient");
		const stagedLsp = stageLspPackages(resolvedTarget, targetConfig);
		verifyStagedArtifacts(resolvedTarget, stagedLsp);

		if (dryRun) {
			console.log(
				`[dry-run] Would package target ${resolvedTarget} to ${resolvedOutputPath}${prerelease ? " as pre-release" : ""}`,
			);
			return;
		}

		const packageArgs = [
			"package",
			"--target",
			resolvedTarget,
			"--allow-missing-repository",
			"--out",
			resolvedOutputPath,
		];
		if (prerelease) {
			packageArgs.push("--pre-release");
		}

		run(vsceBinaryPath, packageArgs, stageDir);
		console.log(`Packaged ${resolvedTarget} VSIX at ${resolvedOutputPath}`);
	} finally {
		fs.rmSync(stageDir, { recursive: true, force: true });
	}
}

main();
