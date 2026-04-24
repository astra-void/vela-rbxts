import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { getPassthroughArgs, runNapi } from "./napi-cli.mjs";
import { stampRepositoryIntoNpmManifests } from "./stamp-repository.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = dirname(SCRIPT_DIR);

async function main() {
	const passthroughArgs = getPassthroughArgs();
	const napiArgs =
		passthroughArgs.length > 0
			? passthroughArgs
			: ["create-npm-dirs", "--npm-dir", "./npm"];

	runNapi(napiArgs, { cwd: PACKAGE_DIR });
	await stampRepositoryIntoNpmManifests({ rootDir: PACKAGE_DIR });
}

await main();
