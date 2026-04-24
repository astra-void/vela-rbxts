import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { exists, readJsonFile, REPO_ROOT, toRepoRelativePath } from "./fs";

export type PackageJson = {
	name?: string;
	version?: string;
	private?: boolean;
	main?: string;
	types?: string;
	exports?: unknown;
	files?: string[];
	napi?: {
		targets?: string[];
	};
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	publishConfig?: {
		access?: string;
	};
};

export type WorkspacePackage = {
	path: string;
	absolutePath: string;
	manifestPath: string;
	manifest: PackageJson;
};

export async function discoverWorkspacePackages() {
	const packageRoots = ["packages", "apps"];
	const discovered: WorkspacePackage[] = [];

	for (const root of packageRoots) {
		const rootPath = join(REPO_ROOT, root);
		if (!exists(rootPath)) {
			continue;
		}

		const children = await readdir(rootPath, { withFileTypes: true });
		for (const child of children) {
			if (!child.isDirectory()) {
				continue;
			}

			const absolutePath = join(rootPath, child.name);
			const manifestPath = join(absolutePath, "package.json");
			if (!exists(manifestPath)) {
				continue;
			}

			const manifest = await readJsonFile<PackageJson>(manifestPath);
			discovered.push({
				path: toRepoRelativePath(absolutePath),
				absolutePath,
				manifestPath,
				manifest,
			});
		}
	}

	return discovered.sort((left, right) => left.path.localeCompare(right.path));
}
