import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@vela-rbxts/core": `${root}/packages/core/src/index.ts`,
		},
	},
});
