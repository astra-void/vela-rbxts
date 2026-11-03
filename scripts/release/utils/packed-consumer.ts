import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PACK_MANIFEST_PATH, type PackManifest } from "./artifacts";
import { formatCommand, runCommand } from "./exec";
import { ensureDir, exists, REPO_ROOT, readJsonFile, writeJsonFile } from "./fs";
import type { PackageJson } from "./package-json";
import { getCurrentCompilerBinaryPackageName } from "./platform";

const PACKED_CONSUMER_PROJECT_NAME = "packed-consumer-smoke";
const PACKED_CONSUMER_OUTPUT_FILE = "out/client/App.luau";
const KEEP_TEMP_DIR_ENV = "VELA_KEEP_PACKED_CONSUMER";

const REQUIRED_OUTPUT_FRAGMENTS = [
	"BackgroundColor3 = Color3.fromRGB(49, 65, 88)",
	// Offsets follow the viewport, so a statically lowered one leaves as a rem
	// binding rather than as a literal.
	"Size = __VelaRem.scale(UDim2.fromOffset(320, 108), ",
	"CornerRadius = __VelaRem.scale(UDim.new(0, 6), ",
	"uistroke",
	"Thickness = __VelaRem.scale(1, ",
	"Thickness = __VelaRem.scale(2, ",
	"Color = Color3.fromRGB(98, 116, 142)",
	"Color3.fromRGB(21, 93, 252)",
	"PaddingLeft = __VelaRem.scale(UDim.new(0, 16), ",
	"PaddingRight = __VelaRem.scale(UDim.new(0, 16), ",
	"PaddingTop = __VelaRem.scale(UDim.new(0, 12), ",
	"PaddingBottom = __VelaRem.scale(UDim.new(0, 12), ",
	"Padding = __VelaRem.scale(UDim.new(0, 16), ",
	// The runtime is one ModuleScript the place shares, reached from a package
	// the consumer never installed by hand.
	'"node_modules", "@rbxts", "vela-runtime"',
	"local VelaRuntimeHost = createVelaRuntimeHost(",
	"React.createElement(VelaRuntimeHost",
	"__velaRules",
	"__velaTag",
] as const;

const FORBIDDEN_OUTPUT_FRAGMENTS = [
	"rbxts-tailwind",
	"@vela-rbxts/runtime",
	"vela-rbxts/runtime",
	"__rbxtsTailwindRuntimeHost",
	"RbxtsTailwindRuntimeHost",
	"../__vela__/runtime-host",
	"raw static className = \"rounded-md bg-slate-700 border border-slate-500 px-4 py-3 w-80 h-27 gap-4\"",
	'className = "rounded-md bg-slate-700 border border-slate-500 px-4 py-3 w-80 h-27 gap-4"',
] as const;

const VELA_CONSUMER_PACKAGE_NAMES = [
	"vela-rbxts",
	"@vela-rbxts/compiler",
	"@vela-rbxts/config",
	"@vela-rbxts/core",
	"@vela-rbxts/ir",
	"@vela-rbxts/rbxtsc-host",
	"@vela-rbxts/types",
] as const;

const HARNESS_PACKAGE_JSON_PATH = join(REPO_ROOT, "apps/rbxts-harness/package.json");

type CommandResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

export type PackedConsumerVerificationReport = {
	projectName: string;
	outputFile: string;
	installedPackages: string[];
	requiredFragments: string[];
};

export async function verifyPackedConsumer(): Promise<PackedConsumerVerificationReport> {
	if (!exists(PACK_MANIFEST_PATH)) {
		throw new Error(
			`Missing pack manifest at ${PACK_MANIFEST_PATH}. Run release:pack first.`,
		);
	}

	const packManifest = await readJsonFile<PackManifest>(PACK_MANIFEST_PATH);
	const artifactsByName = new Map(
		packManifest.artifacts.map((artifact) => [artifact.packageName, artifact]),
	);
	const consumerArtifacts = resolveConsumerArtifacts(artifactsByName);
	const harnessManifest = await readJsonFile<PackageJson>(HARNESS_PACKAGE_JSON_PATH);
	const consumerRootDir = await mkdtemp(join(tmpdir(), "vela-rbxts-packed-consumer-"));
	const keepTempDir = shouldKeepPackedConsumerDirectory();

	let preserveTempDir = keepTempDir;

	try {
		await writePackedConsumerProject(
			consumerRootDir,
			consumerArtifacts,
			packManifest.artifacts,
			harnessManifest,
		);
		await runPackedConsumerCommand(consumerRootDir, "pnpm", ["install"]);
		await runPackedConsumerPreflightChecks(consumerRootDir);
		await runPackedConsumerCommand(consumerRootDir, "pnpm", ["exec", "rbxtsc", "-p", "tsconfig.json"]);

		const outputFilePath = join(consumerRootDir, PACKED_CONSUMER_OUTPUT_FILE);
		if (!exists(outputFilePath)) {
			throw new Error(
				`Packed consumer compile did not produce expected Luau output file: ${outputFilePath}`,
			);
		}

		const outputText = await readFile(outputFilePath, "utf8");
		assertPackedConsumerOutput(outputText, outputFilePath);

		return {
			projectName: PACKED_CONSUMER_PROJECT_NAME,
			outputFile: PACKED_CONSUMER_OUTPUT_FILE,
			installedPackages: consumerArtifacts.map((artifact) => artifact.packageName),
			requiredFragments: [...REQUIRED_OUTPUT_FRAGMENTS],
		};
	} catch (error) {
		preserveTempDir = true;
		throw error;
	} finally {
		if (!preserveTempDir) {
			await rm(consumerRootDir, { recursive: true, force: true });
		}
	}
}

export function assertPackedConsumerOutput(outputText: string, outputFilePath: string) {
	for (const fragment of REQUIRED_OUTPUT_FRAGMENTS) {
		if (!outputText.includes(fragment)) {
			throw new Error(
				`Packed consumer Luau output is missing required fragment in ${outputFilePath}: ${fragment}`,
			);
		}
	}

	for (const fragment of FORBIDDEN_OUTPUT_FRAGMENTS) {
		if (outputText.includes(fragment)) {
			throw new Error(
				`Packed consumer Luau output contains forbidden fragment in ${outputFilePath}: ${fragment}`,
			);
		}
	}
}

function resolveConsumerArtifacts(artifactsByName: ReadonlyMap<string, PackManifest["artifacts"][number]>) {
	const consumerArtifacts: PackManifest["artifacts"] = [];

	for (const packageName of VELA_CONSUMER_PACKAGE_NAMES) {
		const artifact = artifactsByName.get(packageName);
		if (!artifact) {
			throw new Error(
				`Missing packed consumer tarball for ${packageName} in ${PACK_MANIFEST_PATH}.`,
			);
		}
		consumerArtifacts.push(artifact);
	}

	const currentPlatformCompilerBinaryPackageName =
		getCurrentCompilerBinaryPackageName();
	if (currentPlatformCompilerBinaryPackageName) {
		const compilerBinaryArtifact = artifactsByName.get(
			currentPlatformCompilerBinaryPackageName,
		);
		if (!compilerBinaryArtifact) {
			throw new Error(
				`Missing packed consumer tarball for ${currentPlatformCompilerBinaryPackageName} in ${PACK_MANIFEST_PATH}.`,
			);
		}
		consumerArtifacts.push(compilerBinaryArtifact);
	}

	consumerArtifacts.sort((left, right) =>
		left.packageName.localeCompare(right.packageName),
	);

	return consumerArtifacts;
}

async function writePackedConsumerProject(
	rootDir: string,
	consumerArtifacts: ReadonlyArray<PackManifest["artifacts"][number]>,
	allArtifacts: ReadonlyArray<PackManifest["artifacts"][number]>,
	harnessManifest: PackageJson,
) {
	await ensureDir(rootDir);
	await ensureDir(join(rootDir, "include"));
	await ensureDir(join(rootDir, "src", "client"));
	await ensureDir(join(rootDir, "out"));

	const packageJson = buildPackedConsumerPackageJson(
		consumerArtifacts,
		allArtifacts,
		harnessManifest,
	);
	await writeJsonFile(join(rootDir, "package.json"), packageJson);
	await writeFile(
		join(rootDir, "pnpm-workspace.yaml"),
		buildPackedConsumerWorkspaceYaml(packageJson.pnpm?.overrides ?? {}),
		"utf8",
	);
	await writeJsonFile(join(rootDir, "tsconfig.json"), buildPackedConsumerTsConfig());
	await writeJsonFile(join(rootDir, "default.project.json"), buildPackedConsumerProjectJson());
	await writeFile(
		join(rootDir, "vela.config.ts"),
		`import { defineConfig } from "vela-rbxts";

export default defineConfig();
`,
		"utf8",
	);
	await writeFile(
		join(rootDir, "src", "client", "vela-rbxts.d.ts"),
		`import "vela-rbxts";
`,
		"utf8",
	);
	await writeFile(
		join(rootDir, "src", "client", "App.tsx"),
		`import React from "@rbxts/react";

export function App() {
\tconst active = true;

\treturn (
\t\t<screengui ResetOnSpawn={false} IgnoreGuiInset>
\t\t\t<frame className="rounded-md bg-slate-700 border border-slate-500 px-4 py-3 w-80 h-27 gap-4">
\t\t\t\t<textlabel
\t\t\t\t\tBackgroundTransparency={1}
\t\t\t\t\tText="packed consumer smoke"
\t\t\t\t\tTextScaled
\t\t\t\t\tTextWrapped
\t\t\t\t/>
\t\t\t\t<frame
\t\t\t\t\tBackgroundTransparency={1}
\t\t\t\t\tclassName={["bg-blue-600 border-2 border-blue-600", active && "rounded-md"]}
\t\t\t\t/>
\t\t\t\t<frame
\t\t\t\t\tBackgroundTransparency={1}
\t\t\t\t\tclassName="md:px-4 portrait:w-80 touch:px-3"
\t\t\t\t/>
\t\t\t</frame>
\t\t</screengui>
\t);
}
`,
		"utf8",
	);
	await writeFile(
		join(rootDir, "src", "client", "main.client.tsx"),
		`import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "./App";

const localPlayer = Players.LocalPlayer;
if (!localPlayer) {
\terror("LocalPlayer is required.");
}

const playerGuiInstance = localPlayer.WaitForChild("PlayerGui");
if (!playerGuiInstance.IsA("PlayerGui")) {
\terror("PlayerGui instance is required.");
}

const root = ReactRoblox.createRoot(playerGuiInstance);
root.render(<App />);
`,
		"utf8",
	);
}

function buildPackedConsumerPackageJson(
	consumerArtifacts: ReadonlyArray<PackManifest["artifacts"][number]>,
	allArtifacts: ReadonlyArray<PackManifest["artifacts"][number]>,
	harnessManifest: PackageJson,
): PackageJson {
	const dependencies: Record<string, string> = {
		"@rbxts/react": getDependencyVersion(harnessManifest, "@rbxts/react"),
		"@rbxts/react-roblox": getDependencyVersion(
			harnessManifest,
			"@rbxts/react-roblox",
		),
		"@rbxts/services": getDependencyVersion(harnessManifest, "@rbxts/services"),
	};

	for (const artifact of consumerArtifacts) {
		dependencies[artifact.packageName] = pathToFileURL(artifact.tarballPath).href;
	}

	// Release versions are not on the registry yet, so cross-package deps must resolve to packed tarballs.
	const overrides: Record<string, string> = {};
	for (const artifact of allArtifacts) {
		overrides[artifact.packageName] = pathToFileURL(artifact.tarballPath).href;
	}

	return {
		name: PACKED_CONSUMER_PROJECT_NAME,
		version: "0.0.0",
		private: true,
		type: "module",
		scripts: {
			build: "rbxtsc -p tsconfig.json",
		},
		dependencies,
		devDependencies: {
			"@rbxts/compiler-types": getDependencyVersion(
				harnessManifest,
				"@rbxts/compiler-types",
			),
			"@rbxts/types": getDependencyVersion(harnessManifest, "@rbxts/types"),
			"roblox-ts": getDependencyVersion(harnessManifest, "roblox-ts"),
			typescript: getDependencyVersion(harnessManifest, "typescript"),
		},
		pnpm: {
			overrides,
		},
	};
}

// pnpm 11 ignores package.json "pnpm.overrides"; both files are written so either version resolves the tarballs.
function buildPackedConsumerWorkspaceYaml(overrides: Record<string, string>) {
	// The README's pnpm setting: the default linker leaves the transitive runtimes out of `node_modules/@rbxts`.
	const lines = [
		"packages: []",
		"publicHoistPattern:",
		'  - "*@rbxts*"',
		"overrides:",
	];
	for (const [name, specifier] of Object.entries(overrides)) {
		lines.push(`  ${JSON.stringify(name)}: ${JSON.stringify(specifier)}`);
	}
	return `${lines.join("\n")}\n`;
}

function buildPackedConsumerTsConfig(): Record<string, unknown> {
	return {
		compilerOptions: {
			allowSyntheticDefaultImports: true,
			downlevelIteration: true,
			experimentalDecorators: true,
			forceConsistentCasingInFileNames: true,
			baseUrl: "src",
			incremental: true,
			jsx: "react",
			jsxFactory: "React.createElement",
			jsxFragmentFactory: "React.Fragment",
			module: "commonjs",
			moduleDetection: "force",
			moduleResolution: "Node",
			noLib: true,
			outDir: "out",
			resolveJsonModule: true,
			rootDir: "src",
			skipLibCheck: true,
			strict: true,
			target: "ESNext",
			tsBuildInfoFile: "out/tsconfig.tsbuildinfo",
			typeRoots: ["node_modules/@rbxts", "node_modules/@vela-rbxts"],
			types: ["types", "compiler-types"],
			plugins: [
				{
					transform: "vela-rbxts/transformer",
				},
			],
		},
		include: ["src"],
	};
}

function buildPackedConsumerProjectJson(): Record<string, unknown> {
	return {
		name: PACKED_CONSUMER_PROJECT_NAME,
		tree: {
			$className: "DataModel",
			ReplicatedStorage: {
				$className: "ReplicatedStorage",
				node_modules: {
					$className: "Folder",
					"@rbxts": {
						$path: "node_modules/@rbxts",
					},
					"@rbxts-js": {
						$path: "node_modules/@rbxts-js",
					},
				},
				TS: {
					$path: "include",
				},
			},
			StarterPlayer: {
				$className: "StarterPlayer",
				StarterPlayerScripts: {
					$className: "StarterPlayerScripts",
					Client: {
						$path: "out/client",
					},
				},
			},
		},
	};
}

function getDependencyVersion(manifest: PackageJson, name: string): string {
	const version =
		manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
	if (!version) {
		throw new Error(
			`Missing required harness dependency version for ${name} in ${HARNESS_PACKAGE_JSON_PATH}.`,
		);
	}

	return version;
}

async function runPackedConsumerPreflightChecks(rootDir: string) {
	await runPackedConsumerCommand(rootDir, "node", [
		"--input-type=module",
		"--eval",
		[
			'const mod = await import("vela-rbxts");',
			'if (typeof mod.defineConfig !== "function") {',
			'  throw new Error("vela-rbxts root export did not expose defineConfig.");',
			"}",
			'if (typeof mod.defaultConfig === "undefined") {',
			'  throw new Error("vela-rbxts root export did not expose defaultConfig.");',
			"}",
		].join(" "),
	]);

	await runPackedConsumerCommand(rootDir, "node", [
		"--eval",
		[
			'const mod = require("vela-rbxts/transformer");',
			'const transformer = typeof mod === "function"',
			'  ? mod',
			'  : typeof mod.default === "function"',
			'    ? mod.default',
			'    : typeof mod.createTransformer === "function"',
			'      ? mod.createTransformer',
			'      : mod.createRbxtsTailwindProgramTransformer;',
			'if (typeof transformer !== "function") {',
			'  throw new Error("vela-rbxts/transformer did not export a program transformer.");',
			"}",
		].join(" "),
	]);

	await runPackedConsumerCommand(rootDir, "node", [
		"--eval",
		[
			'const compiler = require("@vela-rbxts/compiler");',
			'if (typeof compiler.transform !== "function") {',
			'  throw new Error("@vela-rbxts/compiler did not expose transform.");',
			"}",
		].join(" "),
	]);
}

async function runPackedConsumerCommand(
	cwd: string,
	command: string,
	args: readonly string[],
) {
	const effectiveArgs =
		command === "pnpm" && args[0] === "install"
			? [...args, "--store-dir", join(tmpdir(), "vela-rbxts-pnpm-store")]
			: args;
	const result = captureCommand(command, effectiveArgs, cwd);
	if (result.status !== 0) {
		throw new Error(
			formatCommandFailure(command, effectiveArgs, cwd, result.status, result.stdout, result.stderr),
		);
	}
}

function captureCommand(
	command: string,
	args: readonly string[],
	cwd: string,
): CommandResult {
	let result: ReturnType<typeof runCommand>;
	try {
		result = runCommand(command, args, {
			cwd,
			stdio: "pipe",
			allowFailure: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Failed to execute ${formatCommand(command, args)} in ${cwd}: ${message}`,
		);
	}

	return {
		status: result.status,
		stdout: result.stdout?.toString("utf8") ?? "",
		stderr: result.stderr?.toString("utf8") ?? "",
	};
}

function formatCommandFailure(
	command: string,
	args: readonly string[],
	cwd: string,
	status: number | null,
	stdout: string,
	stderr: string,
) {
	return [
		`Command failed (${status ?? 1}): ${formatCommand(command, args)}`,
		`cwd: ${cwd}`,
		stdout.trim().length > 0 ? `stdout:\n${stdout.trimEnd()}` : "stdout: (empty)",
		stderr.trim().length > 0 ? `stderr:\n${stderr.trimEnd()}` : "stderr: (empty)",
	]
		.filter(Boolean)
		.join("\n");
}

function shouldKeepPackedConsumerDirectory() {
	const value = process.env[KEEP_TEMP_DIR_ENV]?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}
