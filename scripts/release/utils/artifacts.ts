import { join } from "node:path";

import { runCommandCapture } from "./exec";
import { ARTIFACTS_ROOT, ARTIFACT_DIRS } from "./fs";

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
