import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { CliOptions } from "../src/cli/options";
import { runSort } from "../src/cli/sort";

const UNSORTED = `import React from "@rbxts/react";

export const Panel = () => <frame className="bg-slate-700 p-4 rounded-md z-10" />;
`;

const SORTED = `import React from "@rbxts/react";

export const Panel = () => <frame className="z-10 p-4 bg-slate-700 rounded-md" />;
`;

const createdRoots: string[] = [];
let written: string[] = [];

beforeEach(() => {
	written = [];
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		written.push(String(chunk));
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
	vi.restoreAllMocks();
	while (createdRoots.length > 0) {
		fs.rmSync(createdRoots.pop() as string, { recursive: true, force: true });
	}
});

function createProject(
	files: Record<string, string>,
	overrides: Partial<CliOptions> = {},
): CliOptions {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vela-sort-"));
	createdRoots.push(projectRoot);

	for (const [relativePath, contents] of Object.entries(files)) {
		const filePath = path.join(projectRoot, ...relativePath.split("/"));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
	}

	return {
		command: "sort",
		projectRoot,
		srcDir: path.join(projectRoot, "src"),
		outDir: path.join(projectRoot, ".vela", "src"),
		clean: false,
		quiet: true,
		paths: [],
		check: false,
		classFunctions: [],
		...overrides,
	};
}

function read(options: CliOptions, relativePath: string): string {
	return fs.readFileSync(
		path.join(options.projectRoot, ...relativePath.split("/")),
		"utf8",
	);
}

test("--check lists an unsorted file, fails, and writes nothing", () => {
	const options = createProject(
		{ "src/Panel.tsx": UNSORTED, "src/notes.md": "bg-slate-700 p-4" },
		{ check: true },
	);

	expect(runSort(options)).toBe(1);
	expect(written).toEqual([`${path.join("src", "Panel.tsx")}\n`]);
	expect(read(options, "src/Panel.tsx")).toBe(UNSORTED);
});

test("sorts in place, after which --check passes", () => {
	const options = createProject({ "src/Panel.tsx": UNSORTED });

	expect(runSort(options)).toBe(0);
	expect(read(options, "src/Panel.tsx")).toBe(SORTED);
	expect(runSort({ ...options, check: true })).toBe(0);
});

test("sorts only the paths it is given", () => {
	const options = createProject({
		"src/a/Panel.tsx": UNSORTED,
		"src/b/Panel.tsx": UNSORTED,
	});

	expect(
		runSort({
			...options,
			paths: [path.join(options.projectRoot, "src", "a")],
		}),
	).toBe(0);
	expect(read(options, "src/a/Panel.tsx")).toBe(SORTED);
	expect(read(options, "src/b/Panel.tsx")).toBe(UNSORTED);
});

test("sorts a configured helper outside className only when it is named", () => {
	const source = 'const button = tw("bg-slate-700 p-4");\n';
	const options = createProject({ "src/button.tsx": source });

	expect(runSort(options)).toBe(0);
	expect(read(options, "src/button.tsx")).toBe(source);

	expect(runSort({ ...options, classFunctions: ["tw"] })).toBe(0);
	expect(read(options, "src/button.tsx")).toBe(
		'const button = tw("p-4 bg-slate-700");\n',
	);
});
