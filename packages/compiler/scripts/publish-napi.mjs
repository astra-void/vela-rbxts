import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readNapiConfig } from "@napi-rs/cli";

import { getPassthroughArgs, runCommand, runNapi, runPnpm } from "./napi-cli.mjs";
import { stampRepositoryIntoNpmManifests } from "./stamp-repository.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const STAGE_ROOT = join(PACKAGE_DIR, ".npm", "publish");

const options = parseArgs(getPassthroughArgs());
const lifecycleEvent = process.env.npm_lifecycle_event;
const packageJsonPath = join(PACKAGE_DIR, "package.json");
const { binaryName, packageJson, targets } = await readNapiConfig(packageJsonPath);

const shouldPrepareStage =
	options.prepareOnly ||
	lifecycleEvent === "prepublish:napi" ||
	!lifecycleEvent;

const shouldPublishStage =
	!options.prepareOnly &&
	(lifecycleEvent === "publish:napi" || !lifecycleEvent);

if (shouldPrepareStage) {
	await buildRootPackage();
	await prepareStage();
}

if (shouldPublishStage) {
	await publishStage();
}

async function buildRootPackage() {
	runPnpm(["run", "prepack"], { cwd: PACKAGE_DIR });
}

async function prepareStage() {
	await rm(STAGE_ROOT, { force: true, recursive: true });
	await mkdir(STAGE_ROOT, { recursive: true });
	await copyRootPublishFiles();
	await copyNativeBinaries();

	runNapi(["create-npm-dirs", "--npm-dir", "./npm"], { cwd: STAGE_ROOT });
	await copyTargetBinariesToNpmDirs();
	runNapi(
		[
			"pre-publish",
			"--npm-dir",
			"./npm",
			"--skip-optional-publish",
			"--tag-style",
			"npm",
			"--no-gh-release",
		],
		{
			cwd: STAGE_ROOT,
		},
	);
	await stampRepositoryIntoNpmManifests({ rootDir: STAGE_ROOT });
}

async function publishStage() {
	const publishArgs = buildPublishArgs();
	const publishEnv = createPublishEnv();
	const ghReleaseId = process.env.NAPI_GH_RELEASE_ID?.trim();
	const prePublishArgs = [
		"pre-publish",
		"--npm-dir",
		"./npm",
		"--skip-optional-publish",
		"--tag-style",
		"npm",
	];

	if (ghReleaseId) {
		prePublishArgs.push("--gh-release-id", ghReleaseId);
	}

	runNapi(prePublishArgs, {
		cwd: STAGE_ROOT,
		env: publishEnv,
	});
	await stampRepositoryIntoNpmManifests({ rootDir: STAGE_ROOT });

	for (const target of targets) {
		runCommand("npm", publishArgs, {
			cwd: join(STAGE_ROOT, "npm", target.platformArchABI),
			env: publishEnv,
		});
	}

	runCommand("npm", publishArgs, {
		cwd: STAGE_ROOT,
		env: publishEnv,
	});
}

function buildPublishArgs() {
	const publishArgs = ["publish", ...options.publishArgs];

	if (!publishArgs.includes("--ignore-scripts")) {
		publishArgs.push("--ignore-scripts");
	}

	if (options.dryRun && !publishArgs.includes("--dry-run")) {
		publishArgs.push("--dry-run");
	}

	return publishArgs;
}

function createPublishEnv() {
	return {
		...process.env,
	};
}

async function copyRootPublishFiles() {
	for (const relativePath of getRootPublishFiles()) {
		const sourcePath = join(PACKAGE_DIR, relativePath);
		const destinationPath = join(STAGE_ROOT, relativePath);

		if (!existsSync(sourcePath)) {
			throw new Error(`Missing root publish file: ${relativePath}`);
		}

		await mkdir(dirname(destinationPath), { recursive: true });
		await cp(sourcePath, destinationPath, { recursive: true });
	}
}

function getRootPublishFiles() {
	const files = new Set();

	for (const entry of packageJson.files ?? []) {
		if (!entry.includes("*")) {
			files.add(entry);
		}
	}

	files.add("package.json");
	files.add("index.js");
	files.add("index.d.ts");
	files.add(packageJson.main);
	files.add(packageJson.module);
	files.add(packageJson.types);

	return [...files].filter(Boolean).sort();
}

async function copyNativeBinaries() {
	const nodeEntries = (await readdir(PACKAGE_DIR)).filter((entry) =>
		entry.endsWith(".node"),
	);

	if (nodeEntries.length === 0) {
		throw new Error(
			"Missing compiled native binaries in packages/compiler. Run build:native before publishing.",
		);
	}

	await Promise.all(
		nodeEntries.map(async (entry) => {
			await cp(join(PACKAGE_DIR, entry), join(STAGE_ROOT, entry));
		}),
	);
}

async function copyTargetBinariesToNpmDirs() {
	for (const target of targets) {
		const binaryFileName = `${binaryName}.${target.platformArchABI}.node`;
		const artifactFileName = `${binaryName}.${target.triple}.node`;
		const artifactPath = join(PACKAGE_DIR, "artifacts", artifactFileName);
		const sourcePath = existsSync(artifactPath)
			? artifactPath
			: join(PACKAGE_DIR, binaryFileName);
		const targetDir = join(STAGE_ROOT, "npm", target.platformArchABI);
		const destinationPath = join(targetDir, binaryFileName);

		if (!existsSync(sourcePath)) {
			// Local staging only has the current platform binary; full publish jobs
			// must provide every cross-target artifact through packages/compiler/artifacts.
			if (options.prepareOnly) {
				console.warn(
					`Skipping missing target binary: ${artifactFileName} (or local fallback ${binaryFileName})`,
				);
				continue;
			}

			throw new Error(
				`Missing target binary: ${artifactFileName} (and local fallback ${binaryFileName}).`,
			);
		}

		await mkdir(targetDir, { recursive: true });
		await cp(sourcePath, destinationPath);
	}
}

function parseArgs(rawArgs) {
	const publishArgs = [];
	let dryRun = false;
	let prepareOnly = false;

	for (const arg of rawArgs) {
		if (arg === "--") {
			continue;
		}

		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}

		if (arg === "--prepare-only" || arg === "--stage-only") {
			prepareOnly = true;
			continue;
		}

		publishArgs.push(arg);
	}

	return {
		dryRun,
		publishArgs,
		prepareOnly,
	};
}
