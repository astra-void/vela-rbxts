import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	BINARY_PACKAGE_CONFIGS,
	buildBinaryPackageJson,
	buildBinaryReadme,
	buildWrapperPackageJson,
	buildWrapperReadme,
} from "./package-config.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(SCRIPT_DIR, "..");
const STAGE_ROOT = join(PACKAGE_DIR, ".npm", "publish");

await rm(STAGE_ROOT, { force: true, recursive: true });
await mkdir(STAGE_ROOT, { recursive: true });
await mkdir(join(STAGE_ROOT, "bin"), { recursive: true });

const rootPackageJson = JSON.parse(
	await readFile(join(PACKAGE_DIR, "package.json"), "utf8"),
);

await copyFile(
	join(PACKAGE_DIR, "bin", "vela-rbxts-lsp.js"),
	join(STAGE_ROOT, "bin", "vela-rbxts-lsp.js"),
);
await writeJson(
	join(STAGE_ROOT, "package.json"),
	buildWrapperPackageJson({
		repository: rootPackageJson.repository,
		version: rootPackageJson.version,
	}),
);
await writeFile(
	join(STAGE_ROOT, "README.md"),
	buildWrapperReadme(),
	"utf8",
);

for (const config of BINARY_PACKAGE_CONFIGS) {
	const packageDir = join(STAGE_ROOT, "npm", config.directory);
	await mkdir(packageDir, { recursive: true });
	await writeJson(
		join(packageDir, "package.json"),
		buildBinaryPackageJson(config, {
			repository: rootPackageJson.repository,
			version: rootPackageJson.version,
		}),
	);
	await writeFile(join(packageDir, "README.md"), buildBinaryReadme(config), "utf8");
}

async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
