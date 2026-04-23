import { getCompletions, getDiagnostics, getHover } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../config/src/index";

function positionAfter(source: string, needle: string) {
	const index = source.indexOf(needle);
	if (index < 0) {
		throw new Error(`Missing test needle: ${needle}`);
	}
	return index + needle.length;
}

test("completes background color utilities inside className", () => {
	const source = '<frame className="bg-" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, "bg-"),
	});

	expect(result.isInClassNameContext).toBe(true);
	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "bg-surface",
				insertText: "bg-surface",
			}),
		]),
	);
});

test("completes radius utilities inside className", () => {
	const source = '<textbutton className="rounded-" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, "rounded-"),
	});

	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "rounded-md",
			}),
		]),
	);
});

test("completes runtime variants", () => {
	const source = '<frame className="m" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="m'),
	});

	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "md:",
			}),
			expect.objectContaining({
				label: "mouse:",
			}),
		]),
	);
});

test("does not return className completions outside supported context", () => {
	const source = "const value = 'bg-'";
	const result = getCompletions({
		source,
		position: source.length,
	});

	expect(result.isInClassNameContext).toBe(false);
	expect(result.items).toEqual([]);
});

test("returns replacement spans for partial tokens in multi-token className", () => {
	const source = '<frame className="rounded-md bg-su px-4" />';
	const tokenStart = source.indexOf("bg-su");
	const tokenEnd = tokenStart + "bg-su".length;
	const result = getCompletions({
		source,
		position: tokenEnd,
	});

	const entry = result.items.find((item) => item.label === "bg-surface");
	expect(entry).toBeDefined();
	expect(entry?.replacement).toEqual({
		start: tokenStart,
		end: tokenEnd,
	});
});

test("completes config-aware color radius and spacing keys", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					brand: "Color3.fromRGB(1, 2, 3)",
					slate: {
						700: "Color3.fromRGB(4, 5, 6)",
					},
				},
				radius: {
					card: "new UDim(0, 10)",
				},
				spacing: {
					card: "new UDim(0, 18)",
				},
			},
		},
	});

	for (const [source, expected] of [
		['<frame className="bg-" />', "bg-brand"],
		['<frame className="bg-" />', "bg-slate-700"],
		['<frame className="rounded-" />', "rounded-card"],
		['<frame className="px-" />', "px-card"],
	] as const) {
		const result = getCompletions({
			source,
			position: positionAfter(source, source.match(/"(.*)"/)?.[1] ?? ""),
			options: {
				configJson: JSON.stringify(config),
			},
		});

		expect(result.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: expected,
				}),
			]),
		);
	}
});

test("hovers known tokens with Roblox lowering details", () => {
	const source = '<frame className="rounded-md bg-surface gap-4" />';

	expect(
		getHover({
			source,
			position: positionAfter(source, "rounded-md") - 2,
		}).contents,
	).toEqual(
		expect.objectContaining({
			display: "`rounded-md` -> UICorner.CornerRadius",
			documentation: expect.stringContaining("new UDim(0, 6)"),
		}),
	);

	expect(
		getHover({
			source,
			position: positionAfter(source, "bg-surface") - 2,
		}).contents?.display,
	).toBe("`bg-surface` -> BackgroundColor3");

	expect(
		getHover({
			source,
			position: positionAfter(source, "gap-4") - 2,
		}).contents?.display,
	).toBe("`gap-4` -> UIListLayout.Padding");
});

test("hovers include resolved config values when available", () => {
	const source = '<frame className="bg-brand" />';
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					brand: "Color3.fromRGB(1, 2, 3)",
				},
			},
		},
	});

	const hover = getHover({
		source,
		position: positionAfter(source, "bg-brand") - 1,
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(hover.contents?.display).toBe("`bg-brand` -> BackgroundColor3");
	expect(hover.contents?.documentation).toContain("Color3.fromRGB(1, 2, 3)");
});

test("reports editor diagnostics for unknown keys unsupported families and fit", () => {
	const source =
		'<frame><frame className="bg-card bg-surface-700 shadow-md w-fit" /><textbox className="placeholder-card" /></frame>';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: "unknown-theme-key",
				token: "bg-card",
			}),
			expect.objectContaining({
				code: "color-invalid-shade",
				token: "bg-surface-700",
			}),
			expect.objectContaining({
				code: "unsupported-utility-family",
				token: "shadow-md",
			}),
			expect.objectContaining({
				code: "unsupported-size-mode",
				token: "w-fit",
			}),
			expect.objectContaining({
				code: "unknown-theme-key",
				token: "placeholder-card",
			}),
		]),
	);
});

test("reports host-specific invalid utility use when knowable", () => {
	const source =
		'<frame className="text-surface image-surface placeholder-surface" />';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: "unsupported-host-utility",
				token: "text-surface",
			}),
			expect.objectContaining({
				code: "unsupported-host-utility",
				token: "image-surface",
			}),
			expect.objectContaining({
				code: "unsupported-host-utility",
				token: "placeholder-surface",
			}),
		]),
	);
});
