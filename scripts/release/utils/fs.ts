import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
export const ARTIFACTS_ROOT = join(REPO_ROOT, "artifacts");

export const ARTIFACT_DIRS = {
	npm: join(ARTIFACTS_ROOT, "npm"),
	native: join(ARTIFACTS_ROOT, "native"),
	lsp: join(ARTIFACTS_ROOT, "lsp"),
	vsix: join(ARTIFACTS_ROOT, "vsix"),
	logs: join(ARTIFACTS_ROOT, "logs"),
	verify: join(ARTIFACTS_ROOT, "verify"),
} as const;

export function toRepoRelativePath(path: string) {
	return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

export async function ensureDir(path: string) {
	await mkdir(path, { recursive: true });
}

export async function cleanDir(path: string) {
	await rm(path, { recursive: true, force: true });
	await mkdir(path, { recursive: true });
}

export async function ensureArtifactDirs() {
	await ensureDir(ARTIFACTS_ROOT);
	for (const dir of Object.values(ARTIFACT_DIRS)) {
		await ensureDir(dir);
	}
}

export function exists(path: string) {
	return existsSync(path);
}

export async function readJsonFile<T>(path: string) {
	const raw = await readFile(path, "utf8");
	return JSON.parse(raw) as T;
}

export async function writeJsonFile(path: string, value: unknown) {
	await ensureDir(dirname(path));
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function copyFileOrDir(sourcePath: string, destinationPath: string) {
	await ensureDir(dirname(destinationPath));
	await cp(sourcePath, destinationPath, { recursive: true });
}

export async function listFilesRecursive(rootPath: string) {
	const results: string[] = [];

	if (!existsSync(rootPath)) {
		return results;
	}

	const queue: string[] = [rootPath];
	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}

		const entries = await readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(current, entry.name);
			if (entry.isDirectory()) {
				queue.push(fullPath);
			} else if (entry.isFile()) {
				results.push(fullPath);
			}
		}
	}

	return results.sort();
}
