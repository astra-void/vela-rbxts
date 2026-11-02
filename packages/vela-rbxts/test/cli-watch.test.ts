import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearProjectConfigCache } from "@vela-rbxts/rbxtsc-host";
import { afterEach, expect, test, vi } from "vitest";

import { createBuilder } from "../src/cli/builder";
import {
	type ConfigWatcher,
	watchProjectConfig,
} from "../src/cli/config-watch";
import type { CliOptions } from "../src/cli/options";

const COMPONENT = `import React from "@rbxts/react";

export const Panel = () => <frame className="bg-brand p-gap" />;
`;

const createdRoots: string[] = [];
const watchers: ConfigWatcher[] = [];

afterEach(() => {
	vi.restoreAllMocks();
	while (watchers.length > 0) {
		watchers.pop()?.close();
	}
	while (createdRoots.length > 0) {
		fs.rmSync(createdRoots.pop() as string, { recursive: true, force: true });
	}
});

function createProject(files: Record<string, string>): CliOptions {
	const projectRoot = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "vela-watch-")),
	);
	createdRoots.push(projectRoot);
	writeFiles(projectRoot, files);
	clearProjectConfigCache();

	return {
		command: "watch",
		projectRoot,
		srcDir: path.join(projectRoot, "src"),
		outDir: path.join(projectRoot, ".vela", "src"),
		clean: false,
		quiet: true,
	};
}

function writeFiles(root: string, files: Record<string, string>): void {
	for (const [relativePath, contents] of Object.entries(files)) {
		const filePath = path.join(root, ...relativePath.split("/"));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/// Counts change callbacks, after letting the writes that set the project up
/// drain so they cannot be mistaken for the edit under test.
async function watch(options: CliOptions, warn?: (message: string) => void) {
	await delay(150);
	let changes = 0;
	const watcher = watchProjectConfig(
		options,
		() => {
			changes += 1;
		},
		warn,
	);
	watchers.push(watcher);
	await delay(150);
	changes = 0;

	return {
		watcher,
		changes: () => changes,
		async waitForChange(): Promise<number> {
			for (let elapsed = 0; elapsed < 3000 && changes === 0; elapsed += 25) {
				await delay(25);
			}
			return changes;
		},
	};
}

test("rebuilds when a stylesheet imported from outside the root and sources changes", async () => {
	const options = createProject({
		"src/App.tsx": COMPONENT,
		"vela.css": `@import "./design/tokens/colors.css";`,
		"design/tokens/colors.css": `@theme { --color-brand: #ffffff; }`,
	});
	createBuilder(options).buildAll();
	const session = await watch(options);

	writeFiles(options.projectRoot, {
		"design/tokens/colors.css": `@theme { --color-brand: #000000; }`,
	});

	expect(await session.waitForChange()).toBeGreaterThan(0);
});

test("ignores an unrelated file beside an imported stylesheet", async () => {
	const options = createProject({
		"src/App.tsx": COMPONENT,
		"vela.css": `@import "./design/colors.css";`,
		"design/colors.css": `@theme { --color-brand: #ffffff; }`,
	});
	createBuilder(options).buildAll();
	const session = await watch(options);

	writeFiles(options.projectRoot, { "design/notes.txt": "draft" });
	await delay(300);

	expect(session.changes()).toBe(0);
});

test("follows an import added after the watch started", async () => {
	const options = createProject({
		"src/App.tsx": COMPONENT,
		"vela.css": `@theme { --color-brand: #ffffff; }`,
	});
	const builder = createBuilder(options);
	builder.buildAll();
	const session = await watch(options);

	writeFiles(options.projectRoot, {
		"tokens/spacing.css": `@theme { --spacing-gap: 8px; }`,
		"vela.css": `@import "./tokens/spacing.css";\n@theme { --color-brand: #ffffff; }`,
	});
	expect(await session.waitForChange()).toBeGreaterThan(0);

	clearProjectConfigCache();
	builder.buildAll();
	session.watcher.sync();
	await delay(150);
	const before = session.changes();

	writeFiles(options.projectRoot, {
		"tokens/spacing.css": `@theme { --spacing-gap: 12px; }`,
	});

	await delay(300);
	expect(session.changes()).toBeGreaterThan(before);
});

test("polls the config directories when file watching is unavailable", async () => {
	const options = createProject({
		"src/App.tsx": COMPONENT,
		"vela.css": `@import "./design/colors.css";`,
		"design/colors.css": `@theme { --color-brand: #ffffff; }`,
	});
	createBuilder(options).buildAll();
	vi.spyOn(fs, "watch").mockImplementation(() => {
		throw new Error("EMFILE: too many open files, watch");
	});
	const warnings: string[] = [];
	const session = await watch(options, (message) => warnings.push(message));

	expect(warnings).toEqual(
		expect.arrayContaining([
			expect.stringContaining(options.projectRoot),
			expect.stringContaining(path.join(options.projectRoot, "design")),
		]),
	);

	writeFiles(options.projectRoot, {
		"design/colors.css": `@theme { --color-brand: #000000; }`,
	});
	expect(await session.waitForChange()).toBeGreaterThan(0);

	const before = session.changes();
	writeFiles(options.projectRoot, { "design/notes.txt": "draft" });
	await delay(900);
	expect(session.changes()).toBe(before);

	writeFiles(options.projectRoot, {
		"vela.css": `@import "./design/colors.css";\n`,
	});
	await delay(900);
	expect(session.changes()).toBeGreaterThan(before);
});
