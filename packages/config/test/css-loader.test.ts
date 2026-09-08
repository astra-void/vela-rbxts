import { expect, test } from "vitest";

import { loadVelaCss } from "../src/css-loader";
import { defineConfig } from "../src/index";

function readerFor(files: Record<string, string>) {
	return (filePath: string) => files[filePath];
}

test("folds imports in as presets the importing file outranks", () => {
	const loaded = loadVelaCss(
		"/ws/vela.css",
		readerFor({
			"/ws/vela.css": `
				@import "./tokens/palette.css";
				@theme { --color-brand: #ffffff; }
				.btn { @apply bg-brand; }
			`,
			"/ws/tokens/palette.css": `
				@theme {
					--color-brand: #000000;
					--spacing-4: 16px;
				}
			`,
		}),
	);

	expect(loaded.diagnostics).toEqual([]);
	expect(loaded.files).toEqual(["/ws/vela.css", "/ws/tokens/palette.css"]);

	const config = defineConfig(loaded.input);
	expect(config.theme.colors.brand).toBe("Color3.fromRGB(255, 255, 255)");
	expect(config.theme.spacing["4"]).toBe("new UDim(0, 16)");
	expect(config.plugins.utilities.btn).toBe("bg-brand");
});

test("reports a cycle at the import that closes it", () => {
	const loaded = loadVelaCss(
		"/ws/vela.css",
		readerFor({
			"/ws/vela.css": `@import "./a.css";`,
			"/ws/a.css": `@import "./vela.css";`,
		}),
	);

	expect(loaded.diagnostics).toHaveLength(1);
	expect(loaded.diagnostics[0]?.file).toBe("/ws/a.css");
	expect(loaded.diagnostics[0]?.message).toMatch(/already importing it/);
});

test("reads a file imported twice only once", () => {
	const loaded = loadVelaCss(
		"/ws/vela.css",
		readerFor({
			"/ws/vela.css": `@import "./a.css";\n@import "./b.css";`,
			"/ws/a.css": `@import "./shared.css";`,
			"/ws/b.css": `@import "./shared.css";`,
			"/ws/shared.css": `@theme { --spacing-2: 8px; }`,
		}),
	);

	expect(loaded.diagnostics).toEqual([]);
	expect(loaded.files.filter((file) => file.endsWith("shared.css"))).toEqual([
		"/ws/shared.css",
	]);
});

test("rejects a package specifier and a missing file", () => {
	const loaded = loadVelaCss(
		"/ws/vela.css",
		readerFor({
			"/ws/vela.css": `@import "some-package/theme.css";\n@import "./gone.css";`,
		}),
	);

	const messages = loaded.diagnostics.map((diagnostic) => diagnostic.message);
	expect(messages[0]).toMatch(/not a relative path/);
	expect(messages[1]).toMatch(/Could not read \/ws\/gone\.css/);
});

test("carries line and column for an editor", () => {
	const loaded = loadVelaCss(
		"/ws/vela.css",
		readerFor({
			"/ws/vela.css": `@theme {\n\t--shadow-md: 4px;\n}`,
		}),
	);

	expect(loaded.diagnostics[0]).toMatchObject({
		file: "/ws/vela.css",
		line: 2,
		column: 2,
	});
});

test("normalizes windows separators so a cycle is still one file", () => {
	const loaded = loadVelaCss(
		"C:\\ws\\vela.css",
		readerFor({
			"C:/ws/vela.css": `@import "./a.css";`,
			"C:/ws/a.css": `@theme { --spacing-1: 4px; }`,
		}),
	);

	expect(loaded.diagnostics).toEqual([]);
	expect(loaded.files).toEqual(["C:/ws/vela.css", "C:/ws/a.css"]);
});
