import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearProjectConfigCache } from "@vela-rbxts/rbxtsc-host";
import { afterEach, expect, test } from "vitest";

import { createBuilder } from "../src/cli/builder";
import type { CliOptions } from "../src/cli/options";
import { collectSetupWarnings } from "../src/cli/project";
import { runBuild } from "../src/cli/run";

const STYLED_COMPONENT = `import React from "@rbxts/react";

export const Panel = () => <frame className="bg-slate-700" />;
`;

const PLAIN_COMPONENT = `import React from "@rbxts/react";

export const Plain = () => <frame BackgroundTransparency={1} />;
`;

const createdRoots: string[] = [];

afterEach(() => {
	while (createdRoots.length > 0) {
		fs.rmSync(createdRoots.pop() as string, { recursive: true, force: true });
	}
});

function createProject(files: Record<string, string>): CliOptions {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vela-cli-"));
	createdRoots.push(projectRoot);

	for (const [relativePath, contents] of Object.entries(files)) {
		const filePath = path.join(projectRoot, ...relativePath.split("/"));
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, contents);
	}

	return {
		command: "build",
		projectRoot,
		srcDir: path.join(projectRoot, "src"),
		outDir: path.join(projectRoot, ".vela", "src"),
		clean: false,
		quiet: true,
	};
}

function readGenerated(options: CliOptions, relativePath: string): string {
	return fs.readFileSync(
		path.join(options.outDir, ...relativePath.split("/")),
		"utf8",
	);
}

test("lowers className usage and mirrors everything else verbatim", () => {
	const options = createProject({
		"src/Panel.tsx": STYLED_COMPONENT,
		"src/Plain.tsx": PLAIN_COMPONENT,
		"src/data.json": '{ "level": 1 }\n',
		"src/env.d.ts": "export {};\n",
	});

	const stats = createBuilder(options).buildAll();

	expect(stats.errors).toBe(0);
	expect(stats.transformed).toBe(1);
	expect(stats.copied).toBe(3);
	expect(readGenerated(options, "Panel.tsx")).toContain("BackgroundColor3");
	expect(readGenerated(options, "Panel.tsx")).not.toContain("className");
	expect(readGenerated(options, "Plain.tsx")).toBe(PLAIN_COMPONENT);
	expect(readGenerated(options, "data.json")).toBe('{ "level": 1 }\n');
	expect(readGenerated(options, "env.d.ts")).toBe("export {};\n");
});

test("leaves an unchanged output file untouched on rebuild", () => {
	const options = createProject({ "src/Panel.tsx": STYLED_COMPONENT });
	const builder = createBuilder(options);

	builder.buildAll();
	const secondBuild = builder.buildAll();

	expect(secondBuild.written).toBe(0);
});

test("rewrites an output file whose source changed", () => {
	const options = createProject({ "src/Panel.tsx": STYLED_COMPONENT });
	const builder = createBuilder(options);
	builder.buildAll();

	fs.writeFileSync(
		path.join(options.srcDir, "Panel.tsx"),
		STYLED_COMPONENT.replace("bg-slate-700", "bg-slate-900"),
	);
	const stats = builder.rebuild(["Panel.tsx"]);

	expect(stats.written).toBe(1);
	expect(readGenerated(options, "Panel.tsx")).toContain("BackgroundColor3");
});

test("prunes a generated file once its source is gone", () => {
	const options = createProject({
		"src/Panel.tsx": STYLED_COMPONENT,
		"src/nested/Plain.tsx": PLAIN_COMPONENT,
	});
	const builder = createBuilder(options);
	builder.buildAll();

	fs.rmSync(path.join(options.srcDir, "nested", "Plain.tsx"));
	const stats = builder.buildAll();

	expect(stats.removed).toBe(1);
	expect(fs.existsSync(path.join(options.outDir, "nested"))).toBe(false);
	expect(fs.existsSync(path.join(options.outDir, "Panel.tsx"))).toBe(true);
});

test("only prunes what an earlier run recorded", () => {
	const options = createProject({ "src/Panel.tsx": STYLED_COMPONENT });
	const strayPath = path.join(options.outDir, "stray.luau");
	fs.mkdirSync(options.outDir, { recursive: true });
	fs.writeFileSync(strayPath, "-- hand written\n");

	createBuilder(options).buildAll();

	expect(fs.existsSync(strayPath)).toBe(true);
});

test("a new builder reads the manifest an earlier one wrote", () => {
	const options = createProject({
		"src/Panel.tsx": STYLED_COMPONENT,
		"src/Plain.tsx": PLAIN_COMPONENT,
	});
	createBuilder(options).buildAll();

	fs.rmSync(path.join(options.srcDir, "Plain.tsx"));
	const stats = createBuilder(options).buildAll();

	expect(stats.removed).toBe(1);
});

test("clean empties the generated tree", () => {
	const options = createProject({ "src/Panel.tsx": STYLED_COMPONENT });
	const builder = createBuilder(options);
	builder.buildAll();

	builder.clean();

	expect(fs.existsSync(options.outDir)).toBe(false);
});

test("anchors a diagnostic to the line and column that raised it", () => {
	const options = createProject({
		"src/Panel.tsx": `import React from "@rbxts/react";

export const Panel = () => <frame className="bg-not-a-color" />;
`,
	});

	const stats = createBuilder(options).buildAll();

	expect(stats.warnings).toBeGreaterThan(0);
	expect(stats.diagnostics[0].text).toMatch(
		/^Panel\.tsx:3:46 - warning vela\/compiler\(unknown-theme-key\): /,
	);
});

test("runBuild exits non-zero when a file fails to parse", () => {
	const options = createProject({
		"src/Panel.tsx": `export const Panel = () => <frame className="bg-slate-700" ;\n`,
	});

	expect(runBuild(options)).toBe(1);
});

test("writes no lowering for a file whose config does not resolve, and removes the last one", () => {
	const options = createProject({ "src/Panel.tsx": STYLED_COMPONENT });
	const builder = createBuilder(options);
	builder.buildAll();
	expect(readGenerated(options, "Panel.tsx")).toContain("BackgroundColor3");

	fs.writeFileSync(
		path.join(options.projectRoot, "vela.config.json"),
		JSON.stringify({
			theme: { extend: { colors: { surface: { raised: "Color3.new()" } } } },
		}),
	);
	clearProjectConfigCache();
	const stats = builder.buildAll();

	expect(stats.errors).toBe(1);
	expect(stats.diagnostics[0].text).toContain(
		"Panel.tsx - error vela/host(compiler-invocation-failed)",
	);
	expect(fs.existsSync(path.join(options.outDir, "Panel.tsx"))).toBe(false);
	expect(runBuild(options)).toBe(1);
	expect(fs.existsSync(path.join(options.outDir, "Panel.tsx"))).toBe(false);
});

test("runBuild exits zero on a clean tree", () => {
	const options = createProject({ "src/Panel.tsx": STYLED_COMPONENT });

	expect(runBuild(options)).toBe(0);
});

test("warns when the project still points rbxtsc at the untransformed sources", () => {
	const options = createProject({
		"src/Panel.tsx": STYLED_COMPONENT,
		"tsconfig.json": `{
	// roblox-ts writes comments into this file
	"compilerOptions": {
		"rootDir": "src",
		"plugins": [{ "transform": "vela-rbxts/transformer" }],
	}
}
`,
	});

	const warnings = collectSetupWarnings(options);

	expect(warnings).toHaveLength(2);
	expect(warnings[0]).toContain("rootDir");
	expect(warnings[1]).toContain("transformer");
});

test("stays quiet once the project targets the generated tree", () => {
	const options = createProject({
		"src/Panel.tsx": STYLED_COMPONENT,
		"tsconfig.json": `{
	"compilerOptions": { "rootDir": ".vela/src" },
	"include": [".vela/src"]
}
`,
	});

	expect(collectSetupWarnings(options)).toEqual([]);
});
