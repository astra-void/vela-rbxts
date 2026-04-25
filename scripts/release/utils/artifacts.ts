import { join } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { runCommandCapture } from "./exec";
import { ARTIFACTS_ROOT, ARTIFACT_DIRS } from "./fs";
import type { PackageJson } from "./package-json";

export const PACK_MANIFEST_PATH = join(ARTIFACT_DIRS.npm, "pack-manifest.json");
export const VERIFY_REPORT_PATH = join(ARTIFACT_DIRS.verify, "verification-report.json");

export type PackedArtifact = {
	packageName: string;
	version: string;
	tarballFileName: string;
	tarballPath: string;
	sourceDir: string;
	kind: "workspace" | "compiler" | "lsp";
};

export type PackManifest = {
	createdAt: string;
	artifactsRoot: string;
	artifacts: PackedArtifact[];
};

export function getArtifactSummary() {
	return {
		artifactsRoot: ARTIFACTS_ROOT,
		npmDir: ARTIFACT_DIRS.npm,
		nativeDir: ARTIFACT_DIRS.native,
		lspDir: ARTIFACT_DIRS.lsp,
		vsixDir: ARTIFACT_DIRS.vsix,
	};
}

export function listTarEntries(tarballPath: string) {
	const { stdout } = runCommandCapture("tar", ["-tf", tarballPath]);
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export function readTarTextFile(tarballPath: string, entryPath: string) {
	const { stdout } = runCommandCapture("tar", ["-xOf", tarballPath, entryPath]);
	return stdout;
}

export async function readTarballPackageManifest(tarballPath: string) {
	const extractionRoot = await mkdtemp(join(tmpdir(), "vela-rbxts-tarball-"));
	try {
		runCommandCapture("tar", [
			"-xf",
			tarballPath,
			"-C",
			extractionRoot,
			"package/package.json",
		]);
		const raw = await readFile(join(extractionRoot, "package", "package.json"), "utf8");
		return JSON.parse(raw) as PackageJson;
	} finally {
		await rm(extractionRoot, { recursive: true, force: true });
	}
}
