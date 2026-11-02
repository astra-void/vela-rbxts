import fs from "node:fs";
import path from "node:path";

import { transform } from "@vela-rbxts/compiler";
import { defaultConfig } from "@vela-rbxts/config";
import { bench, describe } from "vitest";
import { transformSourceForHost } from "../src/index";

// Run after `pnpm --filter @vela-rbxts/compiler build:native:release`: the default build is debug.
const repoRoot = path.resolve(__dirname, "../../..");

const corpus = [
	"apps/rbxts-harness/src/client/App.tsx",
	"apps/vide-harness/src/client/App.tsx",
	"apps/playground/src/client/App.tsx",
].map((relative) => {
	const fileName = path.join(repoRoot, relative);

	return {
		name: relative.split("/")[1],
		fileName,
		sourceText: fs.readFileSync(fileName, "utf8"),
	};
});

describe("transformSourceForHost", () => {
	for (const file of corpus) {
		transformSourceForHost(file);

		bench(file.name, () => {
			transformSourceForHost(file);
		});
	}
});

describe("compiler.transform config", () => {
	const source = '<frame className="bg-slate-700 rounded-md p-2" />';
	const configJson = JSON.stringify(defaultConfig);

	bench("none", () => {
		transform(source);
	});

	bench("defaults", () => {
		transform(source, { configJson });
	});
});
