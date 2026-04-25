const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const extensionDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(extensionDir, "..", "..");
const defaultVsixDir = path.join(repoRoot, "artifacts", "vsix");
const vsceBinaryPath = path.join(
	extensionDir,
	"node_modules",
	".bin",
	process.platform === "win32" ? "vsce.cmd" : "vsce",
);

function parseArgs(rawArgs) {
	let dryRun = false;
	let artifactDir = defaultVsixDir;

	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];

		if (arg === "--") {
			continue;
		}

		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}

		if (arg === "--artifact-dir") {
			artifactDir = rawArgs[index + 1];
			index += 1;
			continue;
		}

		if (arg.startsWith("--artifact-dir=")) {
			artifactDir = arg.slice("--artifact-dir=".length);
			continue;
		}

		throw new Error(`Unsupported argument: ${arg}`);
	}

	return {
		dryRun,
		artifactDir: path.isAbsolute(artifactDir)
			? artifactDir
			: path.resolve(repoRoot, artifactDir),
	};
}

function requireEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`${name} is required for VS Code Marketplace publishing.`);
	}
	return value;
}

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		env: process.env,
		shell: process.platform === "win32",
	});

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		throw new Error(
			`Command failed (${result.status ?? 1}): ${command} ${args.join(" ")}`,
		);
	}
}

function listVsixFiles(artifactDir) {
	if (!fs.existsSync(artifactDir)) {
		throw new Error(`VSIX artifact directory does not exist: ${artifactDir}`);
	}

	return fs
		.readdirSync(artifactDir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".vsix"))
		.map((entry) => path.join(artifactDir, entry.name))
		.sort();
}

function main() {
	const rawArgs = process.argv.slice(2);
	const { dryRun, artifactDir } = parseArgs(rawArgs);
	const releaseTag = process.env.RELEASE_TAG?.trim() ?? "";
	const prerelease = releaseTag.includes("-");

	if (!dryRun) {
		requireEnv("VSCE_PAT");
	}

	const vsixFiles = listVsixFiles(artifactDir);
	if (vsixFiles.length === 0) {
		throw new Error(`No VSIX files found in ${artifactDir}.`);
	}

	if (dryRun) {
		for (const vsix of vsixFiles) {
			console.log(
				`[dry-run] would publish ${vsix}${prerelease ? " as pre-release" : ""}`,
			);
		}
		return;
	}

	if (!fs.existsSync(vsceBinaryPath)) {
		throw new Error(
			`Could not find vsce binary at ${vsceBinaryPath}. Run pnpm install first.`,
		);
	}

	for (const vsix of vsixFiles) {
		console.log(`Publishing ${vsix}`);
		const args = ["publish", "--packagePath", vsix];
		if (prerelease) {
			args.push("--pre-release");
		}
		run(vsceBinaryPath, args, extensionDir);
	}
}

try {
	main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`publish:vsix failed: ${message}`);
	process.exit(1);
}
