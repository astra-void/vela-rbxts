import { readFileSync } from "node:fs";
import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { emitted, hostConfig, runtimeSource } from "./helpers";

const videRuntimeSource = readFileSync(
	new URL("../../../runtime-vide/src/index.ts", import.meta.url),
	"utf8",
);

// A statically lowered element never renders again, so an offset that has to
// follow the viewport leaves as a binding rather than as a value.
const staticRem = {
	configJson: JSON.stringify(
		defineConfig({ theme: { rem: { min: 16, max: 16 } } }),
	),
};

test("a static offset leaves as a rem binding with the namespace above it", () => {
	const result = transform('<frame className="w-4 p-2" />');

	expect(result.needsRuntimeHost).toBe(false);
	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 4)}",
	);
	expect(emitted(result.code)).toContain(
		"PaddingTop={__VelaRem.scale(new UDim(0, 8), 0)}",
	);
	expect(result.code).toMatch(
		/const __VelaRem = createVelaRemScaler\(\{[\s\S]*?"min": 8\.0/,
	);
	// Only the scaler, not the whole host.
	expect(result.code).not.toContain("createVelaRuntimeHost");
});

test("a pure scale value keeps its literal instead of paying for a binding", () => {
	const result = transform('<frame className="w-full h-1/2" />');

	expect(emitted(result.code)).toContain("Size={UDim2.fromScale(1, 0.5)}");
	expect(result.code).not.toContain("__VelaRem");
});

test("pinning rem takes the binding out of the emit entirely", () => {
	const result = transform('<frame className="w-4 p-2" />', staticRem);

	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain("PaddingTop={new UDim(0, 8)}");
	expect(result.code).not.toContain("__VelaRem");
});

// The host re-renders on a rem change of its own accord, so its props stay
// values and it is handed the names of the ones that are offsets.
test("a runtime host is named the props it should scale itself", () => {
	const result = transform('<frame className="w-4 p-2 hover:w-8" />');

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/__velaRem=\{\[\s*"Size"\s*\]\}/);
	expect(result.code).toContain("Size={(UDim2.fromOffset(16, 0) as never)}");
	// A helper is a host instance the runtime host never reads back, so it
	// takes the binding on this path too.
	expect(emitted(result.code)).toContain(
		"PaddingTop={(__VelaRem.scale(new UDim(0, 8), 0) as never)}",
	);
});

test("the Vide runtime host consumes rem metadata reactively", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify(defineConfig({ framework: "vide" })),
	});

	expect(result.code).toContain('from "@rbxts/vela-runtime-vide"');
	expect(result.code).toMatch(/__velaRem=\{\[\s*"Size"\s*\]\}/);
	expect(videRuntimeSource).toContain(
		"for (const name of props.__velaRem ?? [])",
	);
	expect(videRuntimeSource).toContain("current.remRatio ?? 1");
	expect(videRuntimeSource).toContain("__VelaRemCore.TEXT_SIZE_CEILING");
});

const withVide = {
	configJson: JSON.stringify(defineConfig({ framework: "vide" })),
};

// Vide refuses a prop effect on an instance built inside a function child, so
// a static element's offsets travel as one action that opens its effect untracked.
test("a static Vide element binds its offsets through one action child", () => {
	const result = transform('<frame className="w-6 h-6 p-2" />', withVide);
	const code = emitted(result.code);

	expect(result.needsRuntimeHost).toBe(false);
	expect(code).not.toContain("__VelaRem.scale");
	expect(code).toContain(
		"<uipadding>{__VelaRem.bind({ PaddingTop: new UDim(0, 8), PaddingRight: new UDim(0, 8), PaddingBottom: new UDim(0, 8), PaddingLeft: new UDim(0, 8) })}</uipadding>",
	);
	expect(code).toContain(
		"{__VelaRem.bind({ Size: UDim2.fromOffset(24, 24) })}</frame>",
	);
	expect(videRuntimeSource).toContain(
		"Vide.untrack(() => Vide.effect(() => write(ratio())));",
	);
});

test("an element built inside a function child is bound the same way", () => {
	const result = transform(
		'<frame>{() => [1, 2].map((n) => <frame className="w-6 h-6" />)}</frame>',
		withVide,
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"BackgroundTransparency={1}>{__VelaRem.bind({ Size: UDim2.fromOffset(24, 24) })}</frame>)}</frame>",
	);
});

test("the element's own action runs after the binding", () => {
	const result = transform(
		'<frame className="w-6 h-6" action={(frame) => print(frame.Size)} />',
		withVide,
	);
	const code = emitted(result.code);

	expect(code).not.toContain("action={");
	expect(code).toContain(
		"{__VelaRem.bind({ Size: UDim2.fromOffset(24, 24) })}{__VelaRem.after((frame)=>print(frame.Size))}</frame>",
	);
});

// The action writes after every attribute, which would beat a later spread.
test("a spread after the class keeps a binding per prop on Vide", () => {
	const result = transform(
		'<frame className="w-6 h-6" {...props} />',
		withVide,
	);

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(24, 24), 0)}",
	);
	expect(result.code).not.toContain("__VelaRem.bind");
});

test("the React target keeps a binding per prop", () => {
	const result = transform('<frame className="w-6 h-6" />');

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(24, 24), 0)}",
	);
	expect(result.code).not.toContain("__VelaRem.bind");
});

test("the Vide margin wrapper reads its base spec and current rem ratio", () => {
	const result = transform('<frame className="m-4 hover:bg-red-500" />', {
		configJson: JSON.stringify(defineConfig({ framework: "vide" })),
	});

	expect(result.code).toContain("__velaMargin={");
	expect(videRuntimeSource).toContain("props.__velaMargin,");
	expect(videRuntimeSource).toContain("current.margin,");
	expect(videRuntimeSource).toContain(
		"PaddingTop: () => new UDim(0, margin()?.top ?? 0)",
	);
});

test("a rem config reaches the runtime host through the config it is handed", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify(
			defineConfig({ theme: { rem: { min: 12, max: 32 } } }),
		),
	});

	expect(hostConfig(result.code).theme.rem).toEqual(
		expect.objectContaining({ min: 12, max: 32 }),
	);
});

// The runtime scales by `rem / base`, so a clamp pinned away from `base` is a
// constant ratio rather than no ratio. Dropping it from the emit would leave a
// static offset at 1 while everything the host resolves moved.
test("pinning rem away from base keeps the binding", () => {
	const result = transform('<frame className="w-4 p-2" />', {
		configJson: JSON.stringify(
			defineConfig({ theme: { rem: { min: 24, max: 24 } } }),
		),
	});

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 4)}",
	);
	expect(result.code).toContain("createVelaRemScaler(");
});

// Roblox stops honoring TextSize past 100, so a scaled size stops there rather
// than tweening toward a size the engine never paints.
test("a scaled text size caps at the ceiling Roblox honors", () => {
	const result = transform('<textlabel className="text-6xl" />');

	expect(emitted(result.code)).toContain(
		"TextSize={__VelaRem.scaleText(60, 0)}",
	);

	// The host re-renders on a rem change itself, so it takes the size as a
	// value and caps it where the runtime does.
	const host = transform('<textlabel className="text-6xl hover:text-sm" />');

	expect(host.needsRuntimeHost).toBe(true);
	expect(host.code).toContain("TextSize={(60 as never)}");
});

test("scales a shadow offset with its other pixel dimensions", () => {
	const result = transform('<frame className="shadow-lg" />');

	expect(result.code).toMatch(
		/Offset=\{__VelaRem\.scale\(UDim2\.fromOffset\(0, 10\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/BlurRadius=\{__VelaRem\.scale\(new UDim\(0, 15\), \d+\)\}/,
	);
});

test("an inverted rem clamp collapses onto min instead of reaching the runtime", () => {
	const result = transform('<frame className="w-4 hover:w-8" />', {
		configJson: JSON.stringify({
			theme: { rem: { min: 32, max: 16 } },
		}),
	});

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"min": 32\.0,\s*"max": 32\.0/);
});

// A SurfaceGui is drawn on a part, at the pixel space the part gives it, so the
// viewport the curve follows says nothing about what happens under one.
test("a container named in pinnedUnder keeps the literal offsets below it", () => {
	const result = transform(
		'<surfacegui><frame className="w-4 p-2" /></surfacegui>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain("PaddingTop={new UDim(0, 8)}");
	// Nothing below it scaled, so the file needs neither the scaler nor the pin
	// the runtime would otherwise have to be told about.
	expect(result.code).not.toContain("__VelaRem");
	expect(result.code).not.toContain("__VelaBoundary.Pin");
});

test("a BillboardGui is pinned by default like a SurfaceGui", () => {
	const literal = transform(
		'<billboardgui><frame className="w-4 p-2" /></billboardgui>',
	);

	expect(literal.diagnostics).toEqual([]);
	expect(emitted(literal.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(literal.code)).toContain("PaddingTop={new UDim(0, 8)}");
	expect(literal.code).not.toContain("__VelaRem");

	const runtime = transform(
		'<billboardgui><frame className="w-4 hover:w-8" /></billboardgui>',
	);

	expect(runtime.code).toContain("__velaRemPinned={true}");
	expect(runtime.code).not.toContain("__velaRem={");

	expect(
		emitted(transform("<billboardgui><Panel /></billboardgui>").code),
	).toContain("<__VelaBoundary.Pin><Panel/></__VelaBoundary.Pin>");
});

test("the pin stops at the container that opened it", () => {
	const result = transform(
		'<screengui><surfacegui><frame className="w-4" /></surfacegui><frame className="w-4" /></screengui>',
	);

	expect(emitted(result.code)).toContain("Size={UDim2.fromOffset(16, 0)}");
	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 0)}",
	);
});

// A component was compiled in a file of its own, against the viewport, so the
// only thing that can tell it where it was rendered is the scope around it.
test("a component under the pin is handed it at runtime", () => {
	const result = transform("<surfacegui><Panel /></surfacegui>");

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaBoundary.Pin><Panel/></__VelaBoundary.Pin>",
	);
	expect(result.code).toMatch(
		/import \{[^}]*__VelaBoundary[^}]*\} from "@rbxts\/vela-runtime";/,
	);
});

// A caller hands the container whatever it built, and a fragment or a wrapper
// of its own reads no context on the way down — what hangs under one is still
// owed its literal offsets.
test("the pin reaches through what is not a host element", () => {
	const unpinElement =
		/function unpinElement[\s\S]*?\n\t\}\n/.exec(runtimeSource)?.[0] ?? "";

	// The tag decides which props are put back, not whether the walk goes on.
	expect(unpinElement).toMatch(
		/if \(typeIs\(element\.type as unknown, "string"\)\) \{[\s\S]*?\n\t\t\}\n\n\t\tconst children = props\.children;[\s\S]*?unpin\(children\)/,
	);
});

test("a runtime host under the pin resolves its own class value pinned", () => {
	const result = transform(
		'<surfacegui><frame className="w-4 hover:w-8" /></surfacegui>',
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaRemPinned={true}");
	// It was handed the pin, so there is nothing left for it to scale.
	expect(result.code).not.toContain("__velaRem={");
});

test("a Vide pin defers its children into the scope that holds them", () => {
	const result = transform("<surfacegui><Panel /></surfacegui>", {
		configJson: JSON.stringify(defineConfig({ framework: "vide" })),
	});

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaBoundary.Pin>{()=><Panel/>}</__VelaBoundary.Pin>",
	);
});

test("emptying pinnedUnder puts the container back on the curve", () => {
	const result = transform(
		'<surfacegui><frame className="w-4" /></surfacegui>',
		{
			configJson: JSON.stringify(
				defineConfig({ theme: { rem: { pinnedUnder: [] } } }),
			),
		},
	);

	expect(emitted(result.code)).toContain(
		"Size={__VelaRem.scale(UDim2.fromOffset(16, 0), 0)}",
	);
});

// The runtime is told where a pin lands rather than where one could land, so
// the list of containers is compile-time only.
test("the pinned containers never travel with the config", () => {
	const result = transform('<frame className="w-4 hover:w-8" />');

	expect(result.code).not.toContain("pinnedUnder");
	expect(hostConfig(result.code).theme.rem.pinnedUnder).toBeUndefined();
});
