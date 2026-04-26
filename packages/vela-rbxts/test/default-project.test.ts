import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

test("publishes a rojo project that exposes the runtime dependency", () => {
	const project = JSON.parse(
		readFileSync(new URL("../default.project.json", import.meta.url), "utf8"),
	) as {
		name?: string;
		tree?: {
			runtime?: {
				$path?: string;
			};
		};
	};

	expect(project.name).toBe("vela-rbxts");
	expect(project.tree?.runtime?.$path).toBe("node_modules/@vela-rbxts/runtime");
});
