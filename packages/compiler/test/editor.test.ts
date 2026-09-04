import {
	getCompletions,
	getDiagnostics,
	getDocumentColors,
	getHover,
	sortClassNames,
} from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig, plugin } from "../../config/src/index";

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

test("completes border utilities inside className", () => {
	const source = '<frame className="border" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, "border"),
	});

	expect(result.isInClassNameContext).toBe(true);
	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "border",
			}),
			expect.objectContaining({
				label: "border-0",
			}),
			expect.objectContaining({
				label: "border-2",
			}),
			expect.objectContaining({
				label: "border-transparent",
			}),
			expect.objectContaining({
				label: "border-slate-700",
			}),
			expect.objectContaining({
				label: "border-blue-600",
			}),
			expect.objectContaining({
				label: "border-rose-500",
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

	// A typed variant stays in place: the completion replaces only the utility
	// after the last colon.
	const variantSource = '<frame className="md:bg-" />';
	expect(variantColorResult.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "bg-surface",
				insertText: "bg-surface",
				replacement: {
					start: variantSource.indexOf("bg-"),
					end: variantSource.indexOf("bg-") + "bg-".length,
				},
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
				label: "w-full",
			}),
		]),
	);
	// Variants already applied are not offered again.
	expect(
		variantSizeResult.items.some(
			(item: { label: string }) => item.label === "portrait:",
		),
	).toBe(false);
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
	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "rounded-l-md",
			}),
		]),
	);
});

test("hovers directional radius utilities with their UICorner targets", () => {
	const source = '<frame className="rounded-l-[10%]" />';
	const hover = getHover({
		source,
		position: positionAfter(source, "rounded-l-[10%]") - 2,
	});

	expect(hover.contents?.display).toBe(
		"`rounded-l-[10%]` -> UICorner.TopLeftRadius, UICorner.BottomLeftRadius",
	);
	expect(hover.contents?.documentation).toContain("new UDim(0.1, 0)");
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

test("completes rotate opacity aspect and layout utilities", () => {
	for (const [prefix, expected] of [
		["rotate-", "rotate-45"],
		["-rotate-", "-rotate-90"],
		["opacity-", "opacity-50"],
		["aspect-", "aspect-video"],
		["flex-", "flex-col"],
		["justify-", "justify-center"],
		["items-", "items-end"],
	] as const) {
		const source = `<frame className="${prefix}" />`;
		const result = getCompletions({
			source,
			position: positionAfter(source, prefix),
		});

		expect(result.isInClassNameContext).toBe(true);
		expect(result.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: expected,
					insertText: expected,
				}),
			]),
		);
	}
});

test("hovers rotate opacity aspect and layout utilities", () => {
	for (const [token, display] of [
		["rotate-45", "`rotate-45` -> Rotation"],
		["-rotate-90", "`-rotate-90` -> Rotation"],
		["opacity-50", "`opacity-50` -> BackgroundTransparency"],
		["aspect-video", "`aspect-video` -> UIAspectRatioConstraint.AspectRatio"],
		["flex-row", "`flex-row` -> UIListLayout.FillDirection"],
		["justify-center", "`justify-center` -> UIListLayout.HorizontalAlignment"],
		["items-end", "`items-end` -> UIListLayout.VerticalAlignment"],
	] as const) {
		const source = `<frame className="${token}" />`;
		const hover = getHover({
			source,
			position: positionAfter(source, token) - 1,
		});

		expect(hover.contents?.display).toBe(display);
	}
});

test("reports editor diagnostics for unsupported transform and layout values", () => {
	const source =
		'<frame className="rotate-17 opacity-150 aspect-auto flex-row-reverse justify-between items-stretch" />';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-rotation-value",
			token: "rotate-17",
		}),
		expect.objectContaining({
			code: "unsupported-opacity-value",
			token: "opacity-150",
		}),
		expect.objectContaining({
			code: "unsupported-aspect-value",
			token: "aspect-auto",
		}),
		expect.objectContaining({
			code: "unsupported-flex-direction",
			token: "flex-row-reverse",
		}),
	]);
});

test("reads class values a function returns", () => {
	for (const source of [
		'<frame className={() => "rotate-17"} />',
		'<frame className={() => ["p-4", "rotate-17"]} />',
		'<frame className={() => { return "rotate-17"; }} />',
		'<frame className={function () { return "rotate-17"; }} />',
		'<frame className={() => (flag ? "rotate-17" : "p-4")} />',
	]) {
		expect(getDiagnostics({ source }).diagnostics).toEqual([
			expect.objectContaining({
				code: "unsupported-rotation-value",
				token: "rotate-17",
			}),
		]);

		const start = source.indexOf("rotate-17");
		expect(getDiagnostics({ source }).diagnostics[0]?.range).toEqual({
			start,
			end: start + "rotate-17".length,
		});
	}
});

test("reads class values through the shapes they are written in", () => {
	for (const source of [
		`<frame className={\`p-4 \${flag ? "rotate-17" : ""}\`} />`,
		`<frame className={\`p-4 \${cn("rotate-17")}\`} />`,
		'<frame className={"rotate-17" as const} />',
		'<frame className={["rotate-17"] as const} />',
		'<frame className={"rotate-17" satisfies string} />',
		'<frame className={"p-4 " + "rotate-17"} />',
		'<frame className={{ ["rotate-17"]: flag }} />',
		'<frame className={{ ...{ "rotate-17": flag } }} />',
	]) {
		const start = source.indexOf("rotate-17");
		expect(getDiagnostics({ source }).diagnostics).toEqual([
			expect.objectContaining({
				code: "unsupported-rotation-value",
				token: "rotate-17",
				range: { start, end: start + "rotate-17".length },
			}),
		]);
	}
});

test("a file that does not parse still reads only the class text", () => {
	const source = `<frame className={\`p-4 \${flag ? "rotate-17" : ""}\`} />\nconst broken = ;`;
	const start = source.indexOf("rotate-17");

	expect(getDiagnostics({ source }).diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-rotation-value",
			token: "rotate-17",
			range: { start, end: start + "rotate-17".length },
		}),
	]);
});

test("a class an interpolation splices into is left to the runtime", () => {
	for (const source of [
		`<frame className={\`bg-slate-800 w-[\${width}] rounded-lg\`} />`,
		`<frame className={() => \`w-[\${width}]\`} />`,
		`<frame className={\`bg-\${tone}-500\`} />`,
		`<frame className={\`w-[\${width}]\`} />\nconst broken = ;`,
	]) {
		expect(getDiagnostics({ source }).diagnostics).toEqual([]);
	}
});

test("reads an arbitrary value across the whitespace inside it", () => {
	const source = '<frame className="hover:px-2 w-[calc(100% - 4px)] px-4" />';
	const start = source.indexOf("w-[");

	expect(getDiagnostics({ source }).diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-arbitrary-value",
			token: "w-[calc(100% - 4px)]",
			range: { start, end: start + "w-[calc(100% - 4px)]".length },
		}),
	]);
});

test("a bracket that never closes still separates the classes behind it", () => {
	const source = '<frame className="w-[calc(100% rotate-17" />';

	expect(getDiagnostics({ source }).diagnostics).toEqual([
		expect.objectContaining({ token: "w-[calc(100%" }),
		expect.objectContaining({
			code: "unsupported-rotation-value",
			token: "rotate-17",
		}),
	]);
});

test("a token an interpolation only neighbours is still checked", () => {
	const source = `<frame className={\`rotate-17 \${flag} blorb-2\`} />`;

	expect(getDiagnostics({ source }).diagnostics).toEqual([
		expect.objectContaining({ token: "rotate-17" }),
		expect.objectContaining({ token: "blorb-2" }),
	]);
});

test("sorting keeps the whitespace an interpolation sits between", () => {
	const source = `<frame className={\`bg-slate-700 p-4 \${flag} rounded-md z-10\`} />`;
	const result = sortClassNames({ source });

	expect(result.edits.map((edit: { text: string }) => edit.text)).toEqual([
		"p-4 bg-slate-700 ",
		" z-10 rounded-md",
	]);
});

test("completes and hovers inside a class value a function returns", () => {
	const source = '<frame className={() => ["p-4", "bg-"]} />';
	const completions = getCompletions({
		source,
		position: positionAfter(source, "bg-"),
	});

	expect(completions.isInClassNameContext).toBe(true);
	expect(completions.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ label: "bg-slate-700" }),
		]),
	);

	const hover = getHover({
		source,
		position: positionAfter(source, "p-4") - 1,
	});

	expect(hover.contents?.display).toContain("p-4");
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
			documentation: expect.stringContaining(
				"`0.375rem` (6px at the base viewport)",
			),
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

test("hovers border utilities with UIStroke semantics", () => {
	const source =
		'<frame className="border border-2 border-slate-700 border-transparent" />';

	expect(
		getHover({
			source,
			position: positionAfter(source, "border-2"),
		}).contents?.display,
	).toBe("`border-2` -> UIStroke.Thickness");

	expect(
		getHover({
			source,
			position: positionAfter(source, "border-slate-700"),
		}).contents?.display,
	).toBe("`border-slate-700` -> UIStroke.Color");

	expect(
		getHover({
			source,
			position: positionAfter(source, "border-transparent"),
		}).contents?.display,
	).toBe("`border-transparent` -> UIStroke.Transparency");

	expect(
		getHover({
			source,
			position: positionAfter(source, "border-slate-700"),
		}).contents?.documentation,
	).toContain("resolved");
});

test("hovers the transparency a color opacity modifier lowers to", () => {
	const source =
		'<frame className="bg-slate-700/25 border-slate-700/25 divide-slate-700/10 from-slate-700/50" />';

	expect(
		getHover({ source, position: positionAfter(source, "bg-slate-700/25") })
			.contents?.documentation,
	).toContain("`BackgroundTransparency` to `0.75`");

	expect(
		getHover({ source, position: positionAfter(source, "border-slate-700/25") })
			.contents?.documentation,
	).toContain("`UIStroke.Transparency` to `0.75`");

	expect(
		getHover({ source, position: positionAfter(source, "divide-slate-700/10") })
			.contents?.documentation,
	).toContain("`BackgroundTransparency` to `0.9`");

	expect(
		getHover({ source, position: positionAfter(source, "from-slate-700/50") })
			.contents?.documentation,
	).toContain("`UIGradient.Transparency` keypoint to `0.5`");
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

test("hovers keep plain pixel offsets when rem is pinned static", () => {
	const source = '<frame className="rounded-md p-4" />';
	const config = defineConfig({
		theme: { rem: { min: 16, max: 16 } },
	});
	const options = { configJson: JSON.stringify(config) };

	expect(
		getHover({
			source,
			position: positionAfter(source, "rounded-md") - 2,
			options,
		}).contents?.documentation,
	).toContain("new UDim(0, 6)");

	expect(
		getHover({ source, position: positionAfter(source, "p-4") - 1, options })
			.contents?.documentation,
	).toContain("new UDim(0, 16)");
});

test("hovers read viewport-scaled offsets as rem values", () => {
	const source = '<frame className="p-4 w-80 -translate-y-2 border-2" />';

	expect(
		getHover({ source, position: positionAfter(source, "p-4") - 1 }).contents
			?.documentation,
	).toContain("`1rem` (16px at the base viewport)");

	expect(
		getHover({ source, position: positionAfter(source, "w-80") - 1 }).contents
			?.documentation,
	).toContain("offset `20rem` (320px at the base viewport)");

	expect(
		getHover({ source, position: positionAfter(source, "-translate-y-2") - 1 })
			.contents?.documentation,
	).toContain("`-0.5rem` (-8px at the base viewport)");

	expect(
		getHover({ source, position: positionAfter(source, "border-2") - 1 })
			.contents?.documentation,
	).toContain("`0.125rem` (2px at the base viewport)");
});

test("reports editor diagnostics for unknown keys but not supported utilities", () => {
	const source =
		'<frame><frame className="bg-card bg-surface shadow-md w-fit" /><textbox className="placeholder-card" /></frame>';
	const result = getDiagnostics({ source });

	// `shadow-md` (UIShadow) and `w-fit` (AutomaticSize) are supported.
	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unknown-theme-key",
			token: "bg-card",
		}),
		expect.objectContaining({
			code: "unknown-theme-key",
			token: "bg-surface",
		}),
		expect.objectContaining({
			code: "unknown-theme-key",
			token: "placeholder-card",
		}),
	]);
});

test("reports editor diagnostics for unsupported z-index forms", () => {
	const source = '<frame className="z-auto -z-10 z-[1.5] z-999" />';
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
				token: "z-[1.5]",
			}),
			expect.objectContaining({
				code: "unsupported-z-index-value",
				token: "z-999",
			}),
		]),
	);
});

test("reports editor diagnostics for unsupported border forms", () => {
	const source =
		'<frame className="border-dashed border-x border-8 border-[3em] border-opacity-50" />';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: "unsupported-border-value",
				token: "border-dashed",
			}),
			expect.objectContaining({
				code: "unsupported-border-value",
				token: "border-x",
			}),
			expect.objectContaining({
				code: "unsupported-border-value",
				token: "border-8",
			}),
			expect.objectContaining({
				code: "unsupported-arbitrary-value",
				token: "border-[3em]",
			}),
			expect.objectContaining({
				code: "unsupported-border-value",
				token: "border-opacity-50",
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
					brand: {
						500: "Color3.fromRGB(100, 116, 139)",
					},
				},
			},
		},
	});
	const source =
		'<frame className="bg-sla bg-brand bg-slate-500 bg-surface-500 md:bg- rounded- px-4" />';
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
				token: "bg-brand",
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

test("returns colors for border color utilities", () => {
	const result = getDocumentColors({
		source: '<frame className="border-blue-600" />',
	});

	expect(result.colors).toHaveLength(1);
	expect(result.colors[0]).toEqual(
		expect.objectContaining({
			token: "border-blue-600",
			presentation: "border-blue-600",
		}),
	);
});

test("folds a color opacity modifier into the swatch alpha", () => {
	const result = getDocumentColors({
		source: '<frame className="bg-slate-700/25" />',
	});

	expect(result.colors).toHaveLength(1);
	expect(result.colors[0]).toEqual(
		expect.objectContaining({
			token: "bg-slate-700/25",
			alpha: 0.25,
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

test("offers completions inside a component className", () => {
	const source = `export const A = () => <Box className="bg-sl" />;`;
	const response = getCompletions({
		source,
		position: source.indexOf("bg-sl") + "bg-sl".length,
	});

	expect(response.isInClassNameContext).toBe(true);
	expect(response.items.map((item: { label: string }) => item.label)).toContain(
		"bg-slate-500",
	);
});

test("offers completions inside a member expression component className", () => {
	const source = `export const A = () => <Switch.Root className="bg-sl" />;`;
	const response = getCompletions({
		source,
		position: source.indexOf("bg-sl") + "bg-sl".length,
	});

	expect(response.isInClassNameContext).toBe(true);
	expect(response.items.length).toBeGreaterThan(0);
});

test("keeps host-only utilities available on components", () => {
	const componentSource = `export const A = () => <Box className="text-slate-500" />;`;
	const hostSource = `export const A = () => <frame className="text-slate-500" />;`;

	expect(getDiagnostics({ source: componentSource }).diagnostics).toEqual([]);
	expect(
		getDiagnostics({ source: hostSource }).diagnostics.map(
			(item: { code: string }) => item.code,
		),
	).toEqual(["unsupported-host-utility"]);
});

test("describes host-only utilities on components instead of rejecting them", () => {
	const source = `export const A = () => <Box className="text-slate-500" />;`;
	const response = getHover({
		source,
		position: source.indexOf("text-slate") + 3,
	});

	expect(response.contents?.documentation).toContain("TextColor3");
	expect(response.contents?.documentation).not.toContain("not valid");
});

test("reports document colors inside a component className", () => {
	const source = `export const A = () => <Box className="bg-slate-700" />;`;
	const response = getDocumentColors({ source });

	expect(
		response.colors.map((color: { token: string }) => color.token),
	).toEqual(["bg-slate-700"]);
});

test("ignores className on elements the transformer does not lower", () => {
	const source = `export const A = () => <screengui className="bg-slate-700" />;`;

	expect(getDocumentColors({ source }).colors).toEqual([]);
	expect(
		getCompletions({ source, position: source.indexOf("bg-slate") + 3 })
			.isInClassNameContext,
	).toBe(false);
});

test("completes the new layout utilities inside className", () => {
	const source = '<frame className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});

	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining([
			"right-4",
			"-right-4",
			"bottom-4",
			"content-between",
			"self-center",
			"order-first",
			"order-2",
		]),
	);
});

test("completes typography utilities only on text hosts", () => {
	const textSource = '<textlabel className="" />';
	const textResult = getCompletions({
		source: textSource,
		position: positionAfter(textSource, 'className="'),
	});
	const textLabels = textResult.items.map(
		(item: { label: string }) => item.label,
	);
	expect(textLabels).toEqual(
		expect.arrayContaining(["leading-tight", "italic", "not-italic"]),
	);

	const frameSource = '<frame className="" />';
	const frameResult = getCompletions({
		source: frameSource,
		position: positionAfter(frameSource, 'className="'),
	});
	const frameLabels = frameResult.items.map(
		(item: { label: string }) => item.label,
	);
	expect(frameLabels).not.toContain("leading-tight");
	expect(frameLabels).not.toContain("italic");
});

test("hovers the new utilities with their Roblox targets", () => {
	const source =
		'<textlabel className="right-4 order-2 self-center leading-tight italic" />';

	const right = getHover({
		source,
		position: positionAfter(source, "right-"),
	});
	expect(right.contents?.documentation).toContain("right edge");

	const order = getHover({
		source,
		position: positionAfter(source, "order-2") - 1,
	});
	expect(order.contents?.display).toContain("LayoutOrder");

	const self = getHover({
		source,
		position: positionAfter(source, "self-cent"),
	});
	expect(self.contents?.documentation).toContain(
		"Enum.ItemLineAlignment.Center",
	);

	const leading = getHover({
		source,
		position: positionAfter(source, "leading-t"),
	});
	expect(leading.contents?.documentation).toContain("1.25");

	const italic = getHover({
		source,
		position: positionAfter(source, "italic") - 1,
	});
	expect(italic.contents?.documentation).toContain("Enum.FontStyle.Italic");
});

test("rejects leading utilities on non-text hosts", () => {
	const source = '<frame className="leading-tight" />';
	const result = getDiagnostics({ source });

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-host-utility" }),
	]);
});

test("completes grid, basis, and translate utilities", () => {
	const source = '<frame className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});

	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining([
			"grid",
			"grid-cols-3",
			"grid-rows-2",
			"basis-1/2",
			"translate-x-4",
			"-translate-x-1/2",
		]),
	);
});

test("hovers grid and translate utilities with their Roblox targets", () => {
	const source =
		'<frame className="grid-cols-3 -translate-x-1/2 translate-y-4 basis-1/3" />';

	const grid = getHover({
		source,
		position: positionAfter(source, "grid-cols-"),
	});
	expect(grid.contents?.documentation).toContain("FillDirectionMaxCells = 3");

	const anchor = getHover({
		source,
		position: positionAfter(source, "-translate-x-1"),
	});
	expect(anchor.contents?.documentation).toContain("AnchorPoint");

	const shift = getHover({
		source,
		position: positionAfter(source, "translate-y-"),
	});
	expect(shift.contents?.documentation).toContain("16");

	const basis = getHover({
		source,
		position: positionAfter(source, "basis-1/"),
	});
	expect(basis.contents?.display).toContain("Size.X");
});

test("documents runtime variant conditions in completions and hovers", () => {
	const source = '<frame className="m" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="m'),
	});

	const md = result.items.find(
		(item: { label: string }) => item.label === "md:",
	);
	expect(md?.documentation).toContain("at least 768px wide");
	const mouse = result.items.find(
		(item: { label: string }) => item.label === "mouse:",
	);
	expect(mouse?.documentation).toContain("mouse or keyboard");

	const hoverSource = '<frame className="md:bg-blue-600" />';
	const hover = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "md:bg-blue-600") - 1,
	});
	expect(hover.contents?.documentation).toContain(
		"Runtime variant `md`; applies when the viewport is at least 768px wide.",
	);
});

test("hovers unknown variants without claiming they run", () => {
	const source = '<frame className="checked:px-4" />';
	const hover = getHover({
		source,
		position: positionAfter(source, "checked:px-4") - 1,
	});

	expect(hover.contents?.documentation).toContain("Unknown variant `checked`");
	expect(hover.contents?.documentation).toContain("never applies at runtime");
	expect(hover.contents?.documentation).not.toContain("Runtime variant");
});

test("returns document colors for shadow and gradient color stops", () => {
	const result = getDocumentColors({
		source:
			'<frame className="shadow-slate-700 from-blue-600 via-rose-500 to-slate-500 shadow-md" />',
	});

	expect(result.colors.map((color: { token: string }) => color.token)).toEqual([
		"shadow-slate-700",
		"from-blue-600",
		"via-rose-500",
		"to-slate-500",
	]);
});

test("completes Phase 1 utilities with host awareness", () => {
	const imageSource = '<imagelabel className="" />';
	const imageResult = getCompletions({
		source: imageSource,
		position: positionAfter(imageSource, 'className="'),
	});
	const imageLabels = imageResult.items.map(
		(item: { label: string }) => item.label,
	);
	expect(imageLabels).toEqual(
		expect.arrayContaining(["object-cover", "object-tile"]),
	);

	const frameSource = '<frame className="" />';
	const frameResult = getCompletions({
		source: frameSource,
		position: positionAfter(frameSource, 'className="'),
	});
	const frameLabels = frameResult.items.map(
		(item: { label: string }) => item.label,
	);
	expect(frameLabels).toEqual(
		expect.arrayContaining([
			"pointer-events-none",
			"space-x-4",
			"space-y-2",
			"ring",
			"ring-rose-500",
			"outline-4",
			"mx-auto",
			"my-auto",
		]),
	);
	expect(frameLabels).not.toContain("object-cover");
	expect(frameLabels).not.toContain("overscroll-none");
	expect(frameLabels).not.toContain("whitespace-nowrap");

	const scrollSource = '<scrollingframe className="" />';
	const scrollResult = getCompletions({
		source: scrollSource,
		position: positionAfter(scrollSource, 'className="'),
	});
	const scrollLabels = scrollResult.items.map(
		(item: { label: string }) => item.label,
	);
	expect(scrollLabels).toEqual(expect.arrayContaining(["overscroll-none"]));
});

test("offers scrolling frame utilities only on scrolling frames", () => {
	const frameSource = '<frame className="" />';
	const frameLabels = getCompletions({
		source: frameSource,
		position: positionAfter(frameSource, 'className="'),
	}).items.map((item: { label: string }) => item.label);
	expect(frameLabels).not.toContain("scroll-y");
	expect(frameLabels).not.toContain("scrollbar-none");
	expect(frameLabels).not.toContain("canvas-auto");

	const scrollSource = '<scrollingframe className="" />';
	const scrollLabels = getCompletions({
		source: scrollSource,
		position: positionAfter(scrollSource, 'className="'),
	}).items.map((item: { label: string }) => item.label);
	expect(scrollLabels).toEqual(
		expect.arrayContaining([
			"scroll-y",
			"scroll-none",
			"scrollbar-w-2",
			"scrollbar-none",
			"scrollbar-slate-500",
			"canvas-auto",
			"canvas-none",
		]),
	);
});

test("hovers scrolling frame utilities with their Roblox targets", () => {
	const source =
		'<scrollingframe className="scroll-x scroll-none scrollbar-w-2 scrollbar-slate-500 canvas-auto-y" />';

	expect(
		getHover({ source, position: positionAfter(source, "scroll-x") - 1 })
			.contents?.documentation,
	).toContain("Enum.ScrollingDirection.X");
	expect(
		getHover({ source, position: positionAfter(source, "scroll-non") }).contents
			?.documentation,
	).toContain("ScrollingEnabled");
	expect(
		getHover({ source, position: positionAfter(source, "scrollbar-w-") })
			.contents?.documentation,
	).toContain("`0.5rem` (8px at the base viewport)");
	expect(
		getHover({ source, position: positionAfter(source, "scrollbar-slate-") })
			.contents?.documentation,
	).toContain("ScrollBarImageColor3");
	expect(
		getHover({ source, position: positionAfter(source, "canvas-auto-") })
			.contents?.documentation,
	).toContain("Enum.AutomaticSize.Y");
});

test("completes and hovers font families alongside font weights", () => {
	const source = '<textlabel className="font-" />';
	const labels = getCompletions({
		source,
		position: positionAfter(source, "font-"),
	}).items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining([
			"font-sans",
			"font-serif",
			"font-mono",
			"font-bold",
		]),
	);

	const hovered = '<textlabel className="font-mono" />';
	expect(
		getHover({ source: hovered, position: positionAfter(hovered, "font-mon") })
			.contents?.documentation,
	).toContain("RobotoMono.json");

	// A font family is a theme key, so an unknown one is reported as such
	// instead of as a bad weight.
	expect(
		getDiagnostics({ source: '<textlabel className="font-handwriting" />' })
			.diagnostics,
	).toEqual([
		expect.objectContaining({
			code: "unknown-theme-key",
			token: "font-handwriting",
		}),
	]);
});

test("hovers Phase 1 utilities with their Roblox targets", () => {
	const source =
		'<scrollingframe className="pointer-events-none space-x-4 overscroll-contain ring-2 mx-auto" />';

	const pointer = getHover({
		source,
		position: positionAfter(source, "pointer-events-n"),
	});
	expect(pointer.contents?.documentation).toContain("Interactable");

	const space = getHover({
		source,
		position: positionAfter(source, "space-x-"),
	});
	expect(space.contents?.documentation).toContain("UIListLayout.Padding");

	const overscroll = getHover({
		source,
		position: positionAfter(source, "overscroll-c"),
	});
	expect(overscroll.contents?.documentation).toContain(
		"Enum.ElasticBehavior.WhenScrollable",
	);

	const ring = getHover({
		source,
		position: positionAfter(source, "ring-2") - 1,
	});
	expect(ring.contents?.documentation).toContain("UIStroke.Thickness");

	const center = getHover({
		source,
		position: positionAfter(source, "mx-aut"),
	});
	expect(center.contents?.documentation).toContain("AnchorPoint.X = 0.5");
});

test("completes and hovers transition utilities", () => {
	const source = '<frame className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});
	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining([
			"transition",
			"transition-none",
			"duration-300",
			"delay-150",
			"ease-out",
		]),
	);

	const hoverSource =
		'<frame className="md:bg-blue-600 transition duration-300 ease-in-out" />';
	const transitionHover = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "transition d") - 2,
	});
	expect(transitionHover.contents?.documentation).toContain("TweenService");

	const durationHover = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "duration-3"),
	});
	expect(durationHover.contents?.documentation).toContain("0.3s");

	const easeHover = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "ease-in-o"),
	});
	expect(easeHover.contents?.documentation).toContain(
		"Enum.EasingDirection.InOut",
	);
});

test("completes and hovers animate presets", () => {
	const source = '<frame className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});
	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining([
			"animate-spin",
			"animate-pulse",
			"animate-bounce",
			"animate-none",
		]),
	);

	const hoverSource = '<frame className="animate-spin" />';
	const hover = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "animate-sp"),
	});
	expect(hover.contents?.display).toContain("TweenService loop");
	expect(hover.contents?.documentation).toContain("Rotation");
});

test("completes and hovers text pipeline utilities on text hosts", () => {
	const source = '<textlabel className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});
	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining([
			"uppercase",
			"lowercase",
			"capitalize",
			"normal-case",
			"underline",
			"line-through",
			"no-underline",
		]),
	);

	const frameSource = '<frame className="" />';
	const frameResult = getCompletions({
		source: frameSource,
		position: positionAfter(frameSource, 'className="'),
	});
	const frameLabels = frameResult.items.map(
		(item: { label: string }) => item.label,
	);
	expect(frameLabels).not.toContain("uppercase");
	expect(frameLabels).not.toContain("underline");

	const hoverSource = '<textlabel className="uppercase underline" />';
	const upper = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "upperc"),
	});
	expect(upper.contents?.documentation).toContain("Uppercases");

	const underline = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "underli"),
	});
	expect(underline.contents?.documentation).toContain("<u>");
});

test("completes and hovers margin utilities", () => {
	const source = '<frame className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});
	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining(["m-4", "mx-2", "mt-4", "-mt-2", "-ml-4"]),
	);
	expect(labels).not.toContain("-mb-2");

	const hoverSource = '<frame className="m-4 -ml-2" />';
	const margin = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "m-"),
	});
	expect(margin.contents?.documentation).toContain("margin box");

	const negative = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "-ml-"),
	});
	expect(negative.contents?.documentation).toContain("Shifts `Position`");
});

test("completes and hovers divide utilities", () => {
	const source = '<frame className="" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, 'className="'),
	});
	const labels = result.items.map((item: { label: string }) => item.label);
	expect(labels).toEqual(
		expect.arrayContaining(["divide-x", "divide-y-2", "divide-slate-500"]),
	);

	const hoverSource = '<frame className="divide-y-2 divide-slate-500" />';
	const axis = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "divide-y"),
	});
	expect(axis.contents?.documentation).toContain("separator frame");
	expect(axis.contents?.documentation).toContain("LayoutOrder");

	const color = getHover({
		source: hoverSource,
		position: positionAfter(hoverSource, "divide-slate-5"),
	});
	expect(color.contents?.documentation).toContain("Color3.fromRGB");
});

test("sorts class names into a canonical order", () => {
	const source =
		'<frame className="p-4 bg-slate-700 hover:bg-blue-600 w-40 flex-col rounded-md" />';
	const result = sortClassNames({ source });

	expect(result.edits).toHaveLength(1);
	expect(result.edits[0].text).toBe(
		"flex-col w-40 p-4 bg-slate-700 rounded-md hover:bg-blue-600",
	);
	expect(
		source.slice(result.edits[0].range.start, result.edits[0].range.end),
	).toBe("p-4 bg-slate-700 hover:bg-blue-600 w-40 flex-col rounded-md");
});

test("leaves an already sorted class name alone", () => {
	const result = sortClassNames({
		source: '<frame className="w-40 p-4 bg-slate-700" />',
	});

	expect(result.edits).toEqual([]);
});

test("keeps utilities that fight over one Roblox property in their written order", () => {
	// `gap-*` and `space-y-*` both write UIListLayout.Padding, so whichever the
	// author put last has to stay last.
	const result = sortClassNames({
		source: '<frame className="space-y-2 bg-slate-700 gap-4" />',
	});

	expect(result.edits[0].text).toBe("space-y-2 gap-4 bg-slate-700");
});

const pluginOptions = {
	configJson: JSON.stringify(
		defineConfig({
			plugins: [
				plugin(({ addUtilities }) => {
					addUtilities({
						btn: "bg-blue-600 rounded-lg px-4",
						panel: { BackgroundColor3: "Color3.fromRGB(1, 2, 3)" },
					});
				}),
			],
		}),
	),
};

test("completes the project's own plugin utilities", () => {
	const source = '<frame className="bt" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, "bt"),
		options: pluginOptions,
	});

	expect(result.items).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				label: "btn",
				kind: "plugin utility",
				documentation: "Plugin utility for `bg-blue-600 rounded-lg px-4`.",
			}),
		]),
	);
});

test("hovers a plugin utility with what it expands to", () => {
	const source = '<frame className="hover:panel" />';
	const result = getHover({
		source,
		position: positionAfter(source, "hover:pan"),
		options: pluginOptions,
	});

	expect(result.contents?.display).toBe("`hover:panel`");
	expect(result.contents?.documentation).toContain("Runtime variant `hover`");
	expect(result.contents?.documentation).toContain(
		"`BackgroundColor3 = Color3.fromRGB(1, 2, 3)`",
	);
});

test("does not report a plugin utility as an unknown family", () => {
	const withPlugins = getDiagnostics({
		source: '<frame className="btn panel" />',
		options: pluginOptions,
	});
	expect(withPlugins.diagnostics).toEqual([]);

	const withoutPlugins = getDiagnostics({
		source: '<frame className="btn panel" />',
	});
	expect(withoutPlugins.diagnostics).toHaveLength(2);
});

test("sorts a plugin utility ahead of the utilities that override it", () => {
	const result = sortClassNames({
		source: '<frame className="bg-slate-700 btn p-4" />',
		options: pluginOptions,
	});

	expect(result.edits[0].text).toBe("btn p-4 bg-slate-700");
});

test("sorts an arbitrary value written with spaces as the one class it is", () => {
	const result = sortClassNames({
		source: '<frame className="hover:px-2 w-[calc(100% - 4px)] px-4" />',
	});

	expect(result.edits[0].text).toBe("w-[calc(100% - 4px)] px-4 hover:px-2");
});

test("leaves a class value alone when a bracket never closes", () => {
	const result = sortClassNames({
		source: '<frame className="hover:px-2 w-[calc(100% px-4" />',
	});

	expect(result.edits).toEqual([]);
});

test("sorts a class value whose arbitrary values are balanced", () => {
	const result = sortClassNames({
		source: '<frame className="hover:px-2 w-[120px] px-4" />',
	});

	expect(result.edits[0].text).toBe("w-[120px] px-4 hover:px-2");
});

test("sorting moves the tokens and leaves the whitespace where it was", () => {
	const source = '<frame\n\tclassName="bg-slate-700\n\t\tp-4\n\t\tz-10"\n/>';

	expect(sortClassNames({ source }).edits[0].text).toBe(
		"z-10\n\t\tp-4\n\t\tbg-slate-700",
	);
});

test("does not offer a placeholder color the compiler turns down", () => {
	const source = '<textbox className="placeholder-" />';
	const labels = getCompletions({
		source,
		position: positionAfter(source, "placeholder-"),
	}).items.map((item: { label: string }) => item.label);

	expect(labels).toContain("placeholder-slate-700");
	expect(labels).not.toContain("placeholder-transparent");
	expect(
		getDiagnostics({
			source: '<textbox className="placeholder-transparent" />',
		}).diagnostics,
	).toHaveLength(1);
});

test("reads class values behind a byte order mark", () => {
	const body = '<frame className="bg-slate-700 px-4 blorb-2" />';
	const source = `﻿${body}`;

	const diagnostics = getDiagnostics({ source });
	expect(diagnostics.diagnostics).toHaveLength(1);
	expect(diagnostics.diagnostics[0].token).toBe("blorb-2");
	expect(
		source.slice(
			diagnostics.diagnostics[0].range?.start,
			diagnostics.diagnostics[0].range?.end,
		),
	).toBe("blorb-2");

	const colors = getDocumentColors({ source });
	expect(colors.colors.map((color) => color.token)).toEqual(["bg-slate-700"]);
	expect(
		source.slice(colors.colors[0].range.start, colors.colors[0].range.end),
	).toBe("bg-slate-700");
});

test("completing a variant mid-token leaves the utility behind it", () => {
	const source = '<frame className="hover:bg-slate-700" />';
	const result = getCompletions({
		source,
		position: source.indexOf("hover:") + "hov".length,
	});

	// A utility inserted here would be glued onto `er:bg-slate-700`.
	expect(result.items.every((item) => item.label.endsWith(":"))).toBe(true);
	const entry = result.items.find((item) => item.label === "hover:");
	expect(source.slice(entry?.replacement?.start, entry?.replacement?.end)).toBe(
		"hover:",
	);
});

test("completing the utility replaces it without the variants in front", () => {
	const source = '<frame className="md:bg-sl" />';
	const result = getCompletions({
		source,
		position: positionAfter(source, "md:bg-sl"),
	});

	const entry = result.items.find((item) => item.label === "bg-slate-500");
	expect(source.slice(entry?.replacement?.start, entry?.replacement?.end)).toBe(
		"bg-sl",
	);
	expect(result.items.some((item) => item.label === "md:")).toBe(false);
});
