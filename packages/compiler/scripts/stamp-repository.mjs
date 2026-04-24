import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function stampRepositoryIntoNpmManifests({
	rootDir,
	npmDir = "npm",
}) {
	const rootPackageJsonPath = join(rootDir, "package.json");
	const npmDirPath = join(rootDir, npmDir);

	if (!existsSync(rootPackageJsonPath) || !existsSync(npmDirPath)) {
		return;
	}

	const rootPackageJson = JSON.parse(await readFile(rootPackageJsonPath, "utf8"));
	const repository = rootPackageJson.repository;

	if (!repository) {
		return;
	}

	const entries = await readdir(npmDirPath, { withFileTypes: true });

	await Promise.all(
		entries
			.filter((entry) => entry.isDirectory())
			.map(async (entry) => {
				const packageJsonPath = join(npmDirPath, entry.name, "package.json");

				if (!existsSync(packageJsonPath)) {
					return;
				}

				const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

				packageJson.repository = repository;

				await writeFile(
					packageJsonPath,
					`${JSON.stringify(packageJson, null, 2)}\n`,
				);
			}),
	);
}
