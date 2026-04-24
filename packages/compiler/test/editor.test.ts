import {
	getCompletions,
	getDiagnostics,
	getDocumentColors,
	getHover,
} from "@vela-rbxts/compiler";
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
				label: "bg-slate-500",
				insertText: "bg-slate-500",
			}),
		]),
	);
});

test("completes semantic and palette color tokens with variant-aware prefixes", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					surface: "Color3.fromRGB(40, 48, 66)",
					slate: {
						500: "Color3.fromRGB(100, 116, 139)",
						700: "Color3.fromRGB(71, 85, 105)",
					},
				},
			},
		},
	});

	const semanticResult = getCompletions({
		source: '<frame className="bg-" />',
		position: positionAfter('<frame className="bg-" />', "bg-"),
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(semanticResult.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "bg-surface",
			}),
			expect.objectContaining({
				label: "bg-slate-500",
			}),
		]),
	);

	const paletteResult = getCompletions({
		source: '<frame className="bg-slate-" />',
		position: positionAfter('<frame className="bg-slate-" />', "bg-slate-"),
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(
		paletteResult.items.some(
			(item: { label: string }) => item.label === "bg-surface",
		),
	).toBe(false);
	expect(paletteResult.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "bg-slate-500",
			}),
		]),
	);

	const variantColorResult = getCompletions({
		source: '<frame className="md:bg-" />',
		position: positionAfter('<frame className="md:bg-" />', "md:bg-"),
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(variantColorResult.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "md:bg-surface",
			}),
		]),
	);

	const variantSizeResult = getCompletions({
		source: '<frame className="portrait:w-" />',
		position: positionAfter('<frame className="portrait:w-" />', "portrait:w-"),
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(variantSizeResult.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "portrait:w-full",
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

test("completes z-index utilities inside className", () => {
	const source = '<frame className="z-" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, "z-"),
	});

	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "z-10",
				insertText: "z-10",
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
	const source = '<frame className="rounded-md bg-sl px-4" />';
	const tokenStart = source.indexOf("bg-sl");
	const tokenEnd = tokenStart + "bg-sl".length;
	const result = getCompletions({
		source,
		position: tokenEnd,
	});

	const entry = result.items.find(
		(item: { label: string }) => item.label === "bg-slate-500",
	);
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
	const source = '<frame className="rounded-md bg-slate-700 gap-4" />';

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
			position: positionAfter(source, "bg-slate-700") - 2,
		}).contents?.display,
	).toBe("`bg-slate-700` -> BackgroundColor3");

	expect(
		getHover({
			source,
			position: positionAfter(source, "gap-4") - 2,
		}).contents?.display,
	).toBe("`gap-4` -> UIListLayout.Padding");

	expect(
		getHover({
			source: '<frame className="z-10 md:z-20" />',
			position: positionAfter('<frame className="z-10 md:z-20" />', "z-10") - 1,
		}).contents?.display,
	).toBe("`z-10` -> ZIndex");
});

test("hovers variant-prefixed tokens on the active token only", () => {
	const source = '<frame className="md:bg-blue-600 px-4" />';
	const hover = getHover({
		source,
		position: positionAfter(source, "md:bg-blue-600") - 1,
	});

	expect(hover.contents?.display).toBe("`md:bg-blue-600` -> BackgroundColor3");
	expect(hover.range).toEqual({
		start: source.indexOf("md:bg-blue-600"),
		end: source.indexOf("md:bg-blue-600") + "md:bg-blue-600".length,
	});
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
		'<frame><frame className="bg-card bg-surface shadow-md w-fit" /><textbox className="placeholder-card" /></frame>';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: "unknown-theme-key",
				token: "bg-card",
			}),
			expect.objectContaining({
				code: "unknown-theme-key",
				token: "bg-surface",
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

test("reports editor diagnostics for unsupported z-index forms", () => {
	const source = '<frame className="z-auto -z-10 z-[123] z-999" />';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: "unsupported-z-index-auto",
				token: "z-auto",
			}),
			expect.objectContaining({
				code: "unsupported-negative-z-index",
				token: "-z-10",
			}),
			expect.objectContaining({
				code: "unsupported-arbitrary-z-index",
				token: "z-[123]",
			}),
			expect.objectContaining({
				code: "unsupported-z-index-value",
				token: "z-999",
			}),
		]),
	);
});

test("keeps diagnostics precise for palette and singleton color mismatches", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					surface: "Color3.fromRGB(40, 48, 66)",
					slate: {
						500: "Color3.fromRGB(100, 116, 139)",
					},
				},
			},
		},
	});
	const source =
		'<frame className="bg-sla bg-slate bg-slate-500 bg-surface-500 md:bg- rounded- px-4" />';
	const result = getDiagnostics({
		source,
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: "color-missing-shade",
				token: "bg-slate",
			}),
			expect.objectContaining({
				code: "color-invalid-shade",
				token: "bg-surface-500",
			}),
		]),
	);
	expect(
		result.diagnostics.some(
			(diagnostic: { token?: string }) => diagnostic.token === "bg-sla",
		),
	).toBe(false);
	expect(
		result.diagnostics.some(
			(diagnostic: { token?: string }) => diagnostic.token === "md:bg-",
		),
	).toBe(false);
	expect(
		result.diagnostics.some(
			(diagnostic: { token?: string }) => diagnostic.token === "rounded-",
		),
	).toBe(false);
	// The valid token should stay quiet even when surrounded by invalid fragments.
	expect(
		result.diagnostics.some(
			(diagnostic: { token?: string }) => diagnostic.token === "bg-slate-500",
		),
	).toBe(false);
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

test("normalizes resolved Color3 values to document colors", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					brand: "Color3.fromRGB(1, 2, 3)",
				},
			},
		},
	});
	const result = getDocumentColors({
		source: '<frame className="bg-brand" />',
		options: {
			configJson: JSON.stringify(config),
		},
	});

	expect(result.colors).toHaveLength(1);
	expect(result.colors[0]).toEqual(
		expect.objectContaining({
			token: "bg-brand",
			presentation: "bg-brand",
			red: 1 / 255,
			green: 2 / 255,
			blue: 3 / 255,
			alpha: 1,
		}),
	);
});

test("returns one color for background color utilities", () => {
	const result = getDocumentColors({
		source: '<frame className="rounded-md bg-slate-700 px-4" />',
	});

	expect(result.colors).toHaveLength(1);
	expect(result.colors[0]).toEqual(
		expect.objectContaining({
			token: "bg-slate-700",
			presentation: "bg-slate-700",
		}),
	);
});

test("respects host validation for text color utilities", () => {
	const unsupported = getDocumentColors({
		source: '<frame className="text-blue-500" />',
	});
	const supported = getDocumentColors({
		source: '<textlabel className="text-blue-500" />',
	});

	expect(unsupported.colors).toEqual([]);
	expect(supported.colors).toHaveLength(1);
	expect(supported.colors[0].token).toBe("text-blue-500");
});

test("returns colors for image utilities on image hosts", () => {
	for (const host of ["imagebutton", "imagelabel"] as const) {
		const result = getDocumentColors({
			source: `<${host} className="image-rose-400" />`,
		});

		expect(result.colors).toHaveLength(1);
		expect(result.colors[0].token).toBe("image-rose-400");
	}
});

test("returns colors for placeholder utilities on textbox", () => {
	const result = getDocumentColors({
		source: '<textbox className="placeholder-gray-500" />',
	});

	expect(result.colors).toHaveLength(1);
	expect(result.colors[0].token).toBe("placeholder-gray-500");
});

test("returns full ranges for variant-prefixed color utilities", () => {
	const source = '<frame className="rounded-md md:bg-slate-700 px-4" />';
	const result = getDocumentColors({ source });
	const token = "md:bg-slate-700";
	const start = source.indexOf(token);

	expect(result.colors).toHaveLength(1);
	expect(result.colors[0]).toEqual(
		expect.objectContaining({
			token,
			range: {
				start,
				end: start + token.length,
			},
		}),
	);
});

test("skips unknown colors and non-color utilities", () => {
	const unknown = getDocumentColors({
		source: '<frame className="bg-not-a-real-color" />',
	});
	const nonColor = getDocumentColors({
		source: '<frame className="rounded-md px-4 w-80" />',
	});

	expect(unknown.colors).toEqual([]);
	expect(nonColor.colors).toEqual([]);
});
