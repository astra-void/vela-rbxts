import path from "node:path";
import { expect, test } from "vitest";

import {
	DEFAULT_OUT_DIR,
	DEFAULT_SRC_DIR,
	parseCliArgs,
} from "../src/cli/options";

const CWD = path.resolve("/projects/game");

test("defaults the source and generated trees to the project root", () => {
	const parsed = parseCliArgs(["build"], CWD);

	expect(parsed).toMatchObject({
		kind: "run",
		options: {
			command: "build",
			projectRoot: CWD,
			srcDir: path.join(CWD, DEFAULT_SRC_DIR),
			outDir: path.join(CWD, DEFAULT_OUT_DIR),
			clean: false,
			quiet: false,
		},
	});
});

test("reads flag values in both spellings", () => {
	const spaced = parseCliArgs(
		["watch", "--project", "app", "--src", "source", "--out", "gen"],
		CWD,
	);
	const joined = parseCliArgs(
		["watch", "--project=app", "--src=source", "--out=gen"],
		CWD,
	);

	expect(spaced).toEqual(joined);
	expect(spaced).toMatchObject({
		kind: "run",
		options: {
			command: "watch",
			projectRoot: path.join(CWD, "app"),
			srcDir: path.join(CWD, "app", "source"),
			outDir: path.join(CWD, "app", "gen"),
		},
	});
});

test("collects the boolean flags", () => {
	const parsed = parseCliArgs(["build", "--clean", "-q"], CWD);

	expect(parsed).toMatchObject({
		kind: "run",
		options: { clean: true, quiet: true },
	});
});

test("help wins over every other argument", () => {
	expect(parseCliArgs(["build", "--help"], CWD)).toEqual({ kind: "help" });
	expect(parseCliArgs([], CWD)).toEqual({ kind: "help" });
	expect(parseCliArgs(["-v"], CWD)).toEqual({ kind: "version" });
});

test("rejects arguments it cannot act on", () => {
	expect(parseCliArgs(["compile"], CWD)).toMatchObject({ kind: "error" });
	expect(parseCliArgs(["build", "--nope"], CWD)).toMatchObject({
		kind: "error",
	});
	expect(parseCliArgs(["build", "--out"], CWD)).toMatchObject({
		kind: "error",
	});
	expect(parseCliArgs(["build", "extra"], CWD)).toMatchObject({
		kind: "error",
	});
});

test("remap takes the same tree options as build", () => {
	expect(parseCliArgs(["remap", "--out", "gen"], CWD)).toMatchObject({
		kind: "run",
		options: {
			command: "remap",
			projectRoot: CWD,
			outDir: path.join(CWD, "gen"),
		},
	});
});

test("rbxtsc hands everything after it to rbxtsc untouched", () => {
	const parsed = parseCliArgs(
		["--project", "app", "rbxtsc", "-w", "-p", "tsconfig.json", "--verbose"],
		CWD,
	);

	expect(parsed).toMatchObject({
		kind: "run",
		options: {
			command: "rbxtsc",
			projectRoot: path.join(CWD, "app"),
			forwardedArgs: ["-w", "-p", "tsconfig.json", "--verbose"],
		},
	});
	expect(parseCliArgs(["rbxtsc", "--help"], CWD)).toMatchObject({
		kind: "run",
		options: { command: "rbxtsc", forwardedArgs: ["--help"] },
	});
	expect(parseCliArgs(["rbxtsc"], CWD)).toMatchObject({
		kind: "run",
		options: { forwardedArgs: [] },
	});
});

test("refuses an output tree that would collide with the sources", () => {
	expect(parseCliArgs(["build", "--out", "src"], CWD)).toMatchObject({
		kind: "error",
	});
	expect(parseCliArgs(["build", "--out", "src/generated"], CWD)).toMatchObject({
		kind: "error",
	});
	expect(
		parseCliArgs(["build", "--src", "gen/src", "--out", "gen"], CWD),
	).toMatchObject({ kind: "error" });
	expect(parseCliArgs(["build", "--out", "."], CWD)).toMatchObject({
		kind: "error",
	});
});
