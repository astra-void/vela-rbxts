import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearProjectConfigCache } from "@vela-rbxts/rbxtsc-host";
import ts from "typescript";
import { afterEach, expect, test } from "vitest";

import { createBuilder } from "../src/cli/builder";
import { listFilesRecursive } from "../src/cli/files";
import type { CliOptions } from "../src/cli/options";
import { createSourceMapIndex, remapDiagnosticText } from "../src/cli/remap";

const PANEL = `import React from "@rbxts/react";

export function Panel() {
	return <frame className="hover:bg-red-500 p-2" />;
}

const greeting = "안녕하세요"; const n: number = "nope";
`;

const UTIL = `export const count: number = "none";
`;

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const createdRoots: string[] = [];

afterEach(() => {
	while (createdRoots.length > 0) {
		fs.rmSync(createdRoots.pop() as string, { recursive: true, force: true });
	}
});

function createProject(files: Record<string, string>): CliOptions {
	const projectRoot = fs.realpathSync(
		fs.mkdtempSync(path.join(os.tmpdir(), "vela-remap-")),
	);
	createdRoots.push(projectRoot);
	for (const [relativePath, contents] of Object.entries(files)) {
		const filePath = path.join(projectRoot, ...relativePath.split("/"));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
	}
	clearProjectConfigCache();

	return {
		command: "build",
		projectRoot,
		srcDir: path.join(projectRoot, "src"),
		outDir: path.join(projectRoot, ".vela", "src"),
		clean: false,
		quiet: true,
	};
}

function indexFor(options: CliOptions) {
	return createSourceMapIndex({ ...options, cwd: options.projectRoot });
}

// A real check of the generated file, printed the way rbxtsc prints it.
function checkGenerated(
	options: CliOptions,
	relativePath: string,
	pretty = true,
): string {
	const fileName = path.join(options.outDir, relativePath);
	const program = ts.createProgram([fileName], {
		noEmit: true,
		noLib: true,
		noResolve: true,
		types: [],
		jsx: ts.JsxEmit.React,
	});
	const sourceFile = program.getSourceFile(fileName);
	if (sourceFile === undefined) {
		throw new Error(`${fileName} was not loaded`);
	}
	const diagnostic = program
		.getSemanticDiagnostics(sourceFile)
		.find((candidate) => candidate.code === 2322);
	if (diagnostic === undefined) {
		throw new Error(`no TS2322 in ${fileName}`);
	}

	const host: ts.FormatDiagnosticsHost = {
		getCurrentDirectory: () => options.projectRoot,
		getCanonicalFileName: (name) => name,
		getNewLine: () => "\n",
	};

	return pretty
		? ts.formatDiagnosticsWithColorAndContext([diagnostic], host)
		: ts.formatDiagnostics([diagnostic], host);
}

function columnOf(line: string, needle: string): number {
	return line.indexOf(needle) + 1;
}

test("writes the map beside the generated tree, never inside it", () => {
	const options = createProject({ "src/Panel.tsx": PANEL });
	createBuilder(options).buildAll();

	const mapPath = path.join(
		options.projectRoot,
		".vela",
		"maps",
		"Panel.tsx.map",
	);
	const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
	const generated = fs.readFileSync(
		path.join(options.outDir, "Panel.tsx"),
		"utf8",
	);

	expect(map).toMatchObject({
		version: 3,
		file: "../src/Panel.tsx",
		sources: ["../../src/Panel.tsx"],
		x_vela_generated: createHash("sha1").update(generated).digest("hex"),
	});
	expect(map.mappings).not.toBe("");
	expect(
		listFilesRecursive(options.outDir).filter((file) => file.endsWith(".map")),
	).toEqual([]);
});

test("points a type error in a lowered file at the line it was written on", () => {
	const options = createProject({ "src/Panel.tsx": PANEL });
	createBuilder(options).buildAll();

	const generated = checkGenerated(options, "Panel.tsx");
	expect(generated.replace(ANSI, "")).toMatch(/^\.vela\/src\/Panel\.tsx:/);

	const remapped = remapDiagnosticText(generated, indexFor(options)).replace(
		ANSI,
		"",
	);
	const originalLine = PANEL.split("\n")[6];

	expect(remapped).toMatch(
		new RegExp(
			`^src/Panel\\.tsx:7:${columnOf(originalLine, "n: number")} - error TS2322`,
		),
	);
	expect(remapped).toContain(`7 ${originalLine}`);
	expect(remapped).toContain(
		`${" ".repeat(columnOf(originalLine, "n: number") - 1)}~\n`,
	);
	expect(remapped).not.toContain(".vela/src");
});

test("remaps the plain location format too", () => {
	const options = createProject({ "src/Panel.tsx": PANEL });
	createBuilder(options).buildAll();

	const remapped = remapDiagnosticText(
		checkGenerated(options, "Panel.tsx", false),
		indexFor(options),
	);
	const column = columnOf(PANEL.split("\n")[6], "n: number");

	expect(remapped).toMatch(
		new RegExp(`^src/Panel\\.tsx\\(7,${column}\\): error TS2322`),
	);
});

test("only rewrites the path of a file that was copied through", () => {
	const options = createProject({
		"src/Panel.tsx": PANEL,
		"src/util.ts": UTIL,
	});
	createBuilder(options).buildAll();

	const generated = checkGenerated(options, "util.ts");
	const remapped = remapDiagnosticText(generated, indexFor(options));

	expect(remapped).toBe(generated.replace(".vela/src/util.ts", "src/util.ts"));
	expect(remapped.replace(ANSI, "")).toMatch(/^src\/util\.ts:1:14 - error/);
});

test("leaves a diagnostic alone when the generated file moved on from its map", () => {
	const options = createProject({ "src/Panel.tsx": PANEL });
	createBuilder(options).buildAll();

	const generated = checkGenerated(options, "Panel.tsx");
	fs.appendFileSync(path.join(options.outDir, "Panel.tsx"), "\nexport {};\n");

	expect(remapDiagnosticText(generated, indexFor(options))).toBe(generated);
});

test("leaves a lowered file with no map alone instead of guessing", () => {
	const options = createProject({ "src/Panel.tsx": PANEL });
	createBuilder(options).buildAll();

	const generated = checkGenerated(options, "Panel.tsx");
	fs.rmSync(path.join(options.projectRoot, ".vela", "maps", "Panel.tsx.map"));

	expect(remapDiagnosticText(generated, indexFor(options))).toBe(generated);
});

test("an output tree that would hold the maps gets none, and only copies are remapped", () => {
	const options = createProject({
		"src/Panel.tsx": PANEL,
		"src/util.ts": UTIL,
	});
	options.outDir = path.join(options.projectRoot, ".vela");
	createBuilder(options).buildAll();

	expect(fs.existsSync(path.join(options.outDir, "maps"))).toBe(false);

	const lowered = checkGenerated(options, "Panel.tsx");
	expect(remapDiagnosticText(lowered, indexFor(options))).toBe(lowered);

	const copied = checkGenerated(options, "util.ts");
	expect(remapDiagnosticText(copied, indexFor(options))).toBe(
		copied.replace(".vela/util.ts", "src/util.ts"),
	);
});

test("drops the map with its source, and clean drops them all", () => {
	const options = createProject({
		"src/Panel.tsx": PANEL,
		"src/nested/Card.tsx": PANEL,
	});
	const builder = createBuilder(options);
	builder.buildAll();

	const mapsDir = path.join(options.projectRoot, ".vela", "maps");
	expect(listFilesRecursive(mapsDir)).toEqual([
		"Panel.tsx.map",
		"nested/Card.tsx.map",
	]);

	fs.rmSync(path.join(options.srcDir, "nested", "Card.tsx"));
	builder.rebuild(["nested/Card.tsx"]);
	expect(listFilesRecursive(mapsDir)).toEqual(["Panel.tsx.map"]);
	expect(fs.existsSync(path.join(mapsDir, "nested"))).toBe(false);

	builder.clean();
	expect(fs.existsSync(mapsDir)).toBe(false);
});

test("a file the compiler leaves alone is written as authored, with no map", () => {
	const source = `// kept as written\nexport const layout = <uilistlayout className="p-2" />;\n`;
	const options = createProject({
		"src/Panel.tsx": PANEL,
		"src/Label.tsx": source,
	});
	createBuilder(options).buildAll();

	expect(fs.readFileSync(path.join(options.outDir, "Label.tsx"), "utf8")).toBe(
		source,
	);
	expect(
		fs.existsSync(
			path.join(options.projectRoot, ".vela", "maps", "Label.tsx.map"),
		),
	).toBe(false);
});
