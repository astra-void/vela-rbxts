// Differential test: what the compiler lowers a class to statically against what
// runtime-core resolves the same class to in Luau. Both sides run under Lune and
// are compared in one canonical form.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const compiler = require("@vela-rbxts/compiler");

const HOST_TAGS = [
	"frame",
	"textlabel",
	"textbutton",
	"textbox",
	"imagelabel",
	"imagebutton",
	"scrollingframe",
	"canvasgroup",
];
// A component hides its host tag, so runtime-core resolves it with none.
const COMPONENT = "Card";
const VARIANT_TAGS = ["frame", "textlabel", "imagelabel", COMPONENT];
const VARIANTS = [
	"hover",
	"active",
	"focus",
	"dark",
	"md",
	"max-md",
	"portrait",
	"touch",
	"group-hover",
	"group-active/card",
	"peer-focus/x",
];
const VARIANT_SAMPLE = 120;
const ENVIRONMENTS = [
	{ name: "base" },
	{
		name: "states",
		env: { hovered: true, pressed: true, focused: true, colorScheme: "dark" },
	},
	{
		name: "narrow",
		env: { width: 700, orientation: "portrait", input: "touch" },
	},
	{ name: "attributes", env: { attributes: { State: "open", Tier: 2 } } },
	// What the host's scope watcher reports, so group-* and peer-* rules fire.
	{
		name: "scopes",
		env: {
			groups: {
				"": { hovered: true, pressed: false, focused: false },
				card: { hovered: false, pressed: true, focused: false },
			},
			peers: { x: { hovered: false, pressed: false, focused: true } },
		},
	},
];
const COMBO_SAMPLE = 24;
const SEED = 0x5eed;
const MAX_REPORTED = 60;
const TOLERANCE = 1e-5;

function rng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function sample(random, pool, count) {
	if (pool.length <= count) {
		return [...pool];
	}
	const picked = new Set();
	while (picked.size < count) {
		picked.add(pool[Math.floor(random() * pool.length)]);
	}
	return [...picked];
}

function pick(random, pool) {
	return pool[Math.floor(random() * pool.length)];
}

function resolveLune() {
	if (process.env.LUNE) {
		return process.env.LUNE;
	}
	const manifest = fs.readFileSync(path.join(appRoot, "rokit.toml"), "utf8");
	const version = /lune-org\/lune@([^"\s]+)/.exec(manifest)?.[1];
	const binary = path.join(
		os.homedir(),
		".rokit",
		"tool-storage",
		"lune-org",
		"lune",
		version ?? "",
		process.platform === "win32" ? "lune.exe" : "lune",
	);
	return version && fs.existsSync(binary) ? binary : undefined;
}

function element(tag, className) {
	return `<${tag} className=${JSON.stringify(className)} />`;
}

function hostTagOf(tag) {
	return tag === COMPONENT ? undefined : tag;
}

// `isolate` builds a frame as a CanvasGroup, so the runtime side resolves
// against the class the instance actually has.
function builtTagOf(tag, className) {
	return tag === "frame" && className.split(" ").includes("isolate")
		? "canvasgroup"
		: hostTagOf(tag);
}

const EMPTY_IR = { base: { props: [], helpers: [] }, runtimeRules: [] };
const LOWER_BATCH = 400;

function parseIr(ir) {
	return ir ? JSON.parse(ir) : EMPTY_IR;
}

// One module of many elements per call: the config is parsed once per call, and
// every element's IR comes back in source order.
function lowerAll(tag, classNames, configJson) {
	const out = [];
	for (let start = 0; start < classNames.length; start += LOWER_BATCH) {
		const batch = classNames.slice(start, start + LOWER_BATCH);
		const { ir } = compiler.transform(
			batch.map((className) => `${element(tag, className)};`).join("\n"),
			{ configJson },
		);
		if (ir.length === batch.length) {
			out.push(...ir.map(parseIr));
			continue;
		}
		for (const className of batch) {
			const result = compiler.transform(element(tag, className), {
				configJson,
			});
			out.push(parseIr(result.ir[0]));
		}
	}
	return out;
}

function hostConfig(configJson) {
	const { code } = compiler.transform("<frame className={x} />", {
		configJson,
	});
	const json = /createVelaRuntimeHost\((\{[\s\S]*?\n\})[,)]/.exec(code)?.[1];
	if (!json) {
		throw new Error("the dynamic element emitted no runtime host config");
	}
	return JSON.parse(json);
}

function completions(tag, configJson) {
	const source = `<${tag} className="" />`;
	const { items } = compiler.getCompletions({
		source,
		position: source.indexOf('""') + 1,
		options: { configJson },
	});
	return items
		.map((item) => item.label)
		.filter((label) => !label.endsWith(":"));
}

// Families whose tokens meet in one Roblox property, which is where token order
// and composition can part the two paths.
const COMBO_FAMILIES = [
	{ name: "size+translate", parts: [/^(w|h|size)-/, /^-?translate-[xy]-/] },
	{
		name: "font",
		parts: [
			/^font-(sans|serif|mono)$/,
			/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
			/^(italic|not-italic)$/,
		],
	},
	{
		name: "gradient",
		parts: [/^from-/, /^via-/, /^to-/, /^bg-gradient-to-/],
	},
	{
		name: "rounded",
		parts: [/^rounded(-(none|sm|md|lg|xl|full))?$/, /^rounded-[tblr]{1,2}-/],
	},
	{ name: "bg-alpha+opacity", parts: [/^bg-[a-z]+-\d+\/\d+$/, /^opacity-/] },
	{
		name: "ring+opacity",
		parts: [/^ring(-\d+)?$/, /^ring-[a-z]+-\d+/, /^opacity-/],
	},
	{
		name: "shadow+opacity",
		parts: [/^shadow(-(sm|md|lg|xl|2xl))?$/, /^shadow-[a-z]+-\d+/, /^opacity-/],
	},
	{ name: "text+opacity", parts: [/^text-[a-z]+-\d+(\/\d+)?$/, /^opacity-/] },
	{ name: "image+opacity", parts: [/^image-[a-z]+-\d+(\/\d+)?$/, /^opacity-/] },
	{
		name: "border+opacity",
		parts: [/^border(-\d+)?$/, /^border-[a-z]+-\d+(\/\d+)?$/, /^opacity-/],
	},
	{
		name: "list+gap",
		parts: [/^flex(-row|-col)?$/, /^gap(-[xy])?-/, /^(items|justify)-/],
	},
	{ name: "grid+gap", parts: [/^grid-(cols|rows)-/, /^gap(-[xy])?-/] },
	{ name: "min/max", parts: [/^(w|h)-/, /^min-[wh]-/, /^max-[wh]-/] },
	{ name: "margin", parts: [/^-?m[xytrbl]?-/, /^-?m[xytrbl]?-/] },
	{ name: "padding", parts: [/^p[xytrbl]?-/, /^p[xytrbl]?-/] },
	{
		name: "position",
		parts: [/^-?(inset|top|left|right|bottom)(-[xy])?-/, /^-?translate-[xy]-/],
	},
	{
		name: "divide",
		parts: [/^divide-[xy](-\d+)?$/, /^divide-[a-z]+-\d+(\/\d+)?$/],
	},
];

const CURATED = [
	"bg-red-500/50 opacity-50",
	"opacity-50 bg-red-500/50",
	"ring-2 ring-blue-500 opacity-75",
	"shadow-lg shadow-red-500/40 opacity-50",
	"border-2 border-red-500/50 opacity-25",
	"inset-shadow-xs text-shadow-lg opacity-50",
	"backdrop-blur-md opacity-50",
	"text-red-500/25 bg-blue-500 opacity-50",
	"from-red-500 via-blue-500 to-green-500 bg-gradient-to-r",
	"rounded-md rounded-tl-lg",
	"w-10 h-1/2 translate-x-1/2",
	"font-mono font-bold italic",
	"w-10 size-4",
	"flex flex-col gap-2 items-center",
	"p-2 px-4",
	"m-4 mt-0",
	"m-0",
	"-mt-0 -ml-0",
	"w-full h-full min-w-10 max-w-20",
	"inset-0 top-2",
	"-translate-y-1/2 top-1/2",
	"grid grid-cols-3 gap-4",
	"grid grid-cols-3 gap-[10%]",
	"grid grid-cols-3 gap-4 gap-[10%]",
	"divide-y divide-red-500 space-y-2",
	"bg-red-500 bg-blue-500",
	"bg-red-500/50 bg-blue-500",
	"bg-transparent bg-blue-500",
	"text-red-500/50 text-blue-500",
	"image-red-500/50 image-blue-500",
	"ring-blue-500/50 ring-blue-500",
	"border-red-500/50 border-red-500",
	"from-red-500/50 from-blue-500 to-green-500",
	"divide-y divide-red-500/50 divide-red-500",
	"divide-y divide-red-500/50 opacity-50",
	"divide-x-0 divide-red-500",
	"isolate opacity-50 bg-red-500",
	"isolate bg-red-500/50 opacity-25",
	"w-1/2 w-10",
	"aspect-square w-10",
	"uppercase underline",
];

// Several tokens under one variant, `@` standing for it: the rules that fire
// together have to compose the way the class tokens do.
const VARIANT_CURATED = [
	"bg-red-500 @:bg-blue-500/50 @:opacity-50",
	"opacity-50 @:opacity-75 @:bg-blue-500",
	"bg-red-500/50 opacity-50 @:opacity-25",
	"bg-red-500/50 @:bg-blue-500",
	"ring-2 @:opacity-50",
	"ring-2 @:ring-blue-500/50 @:opacity-50",
	"@:ring-2 @:opacity-50",
	"shadow-md @:shadow-red-500/40 @:opacity-50",
	"text-red-500/50 @:text-blue-500 @:opacity-50",
	"image-red-500 @:image-blue-500/50 @:opacity-50",
];

// Variants written before the base and breakpoints written out of screen
// order, `@` standing for any variant: both paths rank what applies rather than
// taking the order it was written in.
const ORDER_CURATED = [
	"@:bg-blue-500 bg-red-500",
	"@:opacity-75 opacity-50",
	"@:bg-blue-500/50 bg-red-500 opacity-50",
	"@:mt-4 mt-2",
	"@:divide-red-500 divide-y",
	"@:uppercase lowercase",
	"@:duration-300 transition duration-150",
	"@:gap-4 grid grid-cols-3 gap-2",
	"lg:bg-red-500 md:bg-blue-500",
	"md:bg-blue-500 lg:bg-red-500",
	"xl:p-4 sm:p-2 md:p-8",
	"lg:w-10 md:w-1/2 w-full",
	"max-md:bg-red-500 md:bg-blue-500 bg-green-500",
	"md:hover:bg-red-500 hover:bg-blue-500",
	"md:bg-red-500 hover:bg-blue-500",
	"lg:mt-4 md:mt-2 mt-1",
	"lg:text-red-500 md:text-blue-500 text-green-500",
	"lg:opacity-25 md:opacity-50 opacity-75",
	"lg:gap-4 md:gap-2 grid grid-cols-3",
	"lg:divide-red-500 md:divide-blue-500 divide-y",
	"lg:duration-300 md:duration-150 transition",
	"lg:uppercase md:lowercase capitalize",
	"dark:bg-blue-500 md:bg-red-500",
	"md:bg-red-500 portrait:bg-blue-500 touch:bg-green-500",
	"-translate-x-1/2 left-1/2 @:translate-x-4",
	"@:translate-x-4 -translate-x-1/2 left-1/2",
	"mx-auto -translate-y-1/2 @:translate-x-4",
	"-translate-x-4 @:left-4",
	"-ml-2 left-4 @:left-8",
	"-mt-2 top-4 @:mt-8",
];
const BREAKPOINTS = ["sm", "md", "lg", "xl"];
const ORDER_ENVIRONMENTS = [
	...ENVIRONMENTS,
	{ name: "between", env: { width: 1000, hovered: true } },
];

// A curated combo only runs where every token is one the host can carry: the
// static path leaves that to the type checker, which a harness never runs. An
// arbitrary value is never completed, so it counts when its utility is.
function curatedFor(labels, combos = CURATED) {
	const known = new Set(labels);
	const carries = (utility) => {
		const bracket = utility.indexOf("[");
		return bracket < 0
			? known.has(utility)
			: labels.some((label) => label.startsWith(utility.slice(0, bracket)));
	};
	return combos.filter((combo) =>
		combo.split(" ").every((token) => carries(token.split(":").at(-1))),
	);
}

function orderCases(random, labels, prefixes) {
	const out = new Set();
	for (const combo of curatedFor(labels, ORDER_CURATED)) {
		out.add(combo.replaceAll("@:", `${pick(random, prefixes)}:`));
	}
	for (const combo of curatedFor(labels)) {
		const tokens = combo.split(" ");
		if (tokens.length >= 2) {
			out.add(
				[`${pick(random, prefixes)}:${tokens.at(-1)}`, ...tokens.slice(0, -1)].join(
					" ",
				),
			);
		}
	}
	// Two breakpoints over one family, the wider one written first as often as not.
	for (const family of COMBO_FAMILIES) {
		const pool = labels.filter((label) => family.parts[0].test(label));
		if (pool.length === 0) {
			continue;
		}
		for (let index = 0; index < COMBO_SAMPLE / 4; index++) {
			const screens = sample(random, BREAKPOINTS, 2);
			out.add(
				[
					...screens.map((screen) => `${screen}:${pick(random, pool)}`),
					pick(random, pool),
				].join(" "),
			);
		}
	}
	return [...out];
}

function combos(random, labels) {
	const out = new Set(curatedFor(labels));
	for (const family of COMBO_FAMILIES) {
		const pools = family.parts.map((part) =>
			labels.filter((label) => part.test(label)),
		);
		if (pools.some((pool) => pool.length === 0)) {
			continue;
		}
		for (let index = 0; index < COMBO_SAMPLE; index++) {
			const tokens = pools.map((pool) => pick(random, pool));
			if (random() < 0.5) {
				tokens.reverse();
			}
			out.add(tokens.join(" "));
		}
	}
	return [...out];
}

function variantCases(random, labels, prefixes) {
	const out = [];
	for (const variant of prefixes) {
		for (const label of sample(random, labels, VARIANT_SAMPLE)) {
			out.push(`${variant}:${label}`);
		}
	}
	// A base token beside a variant of its own family is where a rule has to
	// overlay what shipped statically.
	for (const combo of curatedFor(labels)) {
		const tokens = combo.split(" ");
		if (tokens.length < 2) {
			continue;
		}
		const variant = pick(random, prefixes);
		out.push([...tokens.slice(0, -1), `${variant}:${tokens.at(-1)}`].join(" "));
	}
	for (const combo of curatedFor(labels, VARIANT_CURATED)) {
		for (const variant of prefixes) {
			out.push(combo.replaceAll("@:", `${variant}:`));
		}
	}
	return out;
}

async function buildSuites() {
	const { defineConfig, plugin } = await import("@vela-rbxts/config");
	const random = rng(SEED);

	const configs = [
		{ id: "default", config: defineConfig({ preflight: false }) },
		{
			id: "extended",
			config: defineConfig({
				preflight: false,
				theme: {
					extend: {
						colors: {
							brand: {
								300: "Color3.fromRGB(147, 197, 253)",
								500: "Color3.fromRGB(59, 130, 246)",
							},
						},
						spacing: { 18: "new UDim(0, 72)" },
						radius: { card: "new UDim(0, 12)" },
					},
				},
				plugins: [
					plugin(({ addUtilities, addVariant }) => {
						addUtilities({
							"parity-card": "bg-brand-500 rounded-card p-18 opacity-50",
							"parity-plate": {
								BackgroundColor3: "Color3.fromRGB(10, 20, 30)",
								LayoutOrder: "7",
							},
						});
						addVariant("open", { attribute: "State", equals: "open" });
					}),
				],
			}),
			filter: /brand|card|18|parity-/,
			variants: ["open", "attr-[Tier=2]", "hover"],
		},
	];

	const suites = [];
	for (const { id, config, filter, variants } of configs) {
		const configJson = JSON.stringify(config);
		const cases = [];
		const add = (lane, tag, className, env) => {
			cases.push({
				id: `${id}#${cases.length}`,
				config: id,
				lane,
				tag: builtTagOf(tag, className),
				label: tag,
				className,
				env: env?.env,
				envName: env?.name,
			});
		};

		for (const tag of [...HOST_TAGS, COMPONENT]) {
			let labels = completions(tag, configJson);
			if (filter) {
				labels = labels.filter((label) => filter.test(label));
			}
			for (const label of labels) {
				add("static", tag, label);
			}
			if (filter || VARIANT_TAGS.includes(tag)) {
				for (const combo of combos(random, labels)) {
					add("static", tag, combo);
				}
			}

			if (!VARIANT_TAGS.includes(tag)) {
				continue;
			}
			for (const className of variantCases(
				random,
				labels,
				variants ?? VARIANTS,
			)) {
				for (const env of ENVIRONMENTS) {
					add("rule", tag, className, env);
				}
			}
			if (!filter) {
				for (const className of orderCases(random, labels, VARIANTS)) {
					for (const env of ORDER_ENVIRONMENTS) {
						add("order", tag, className, env);
					}
				}
			}
		}

		const byElement = new Map();
		for (const testCase of cases) {
			const key = `${testCase.label}\0${testCase.className}`;
			if (!byElement.has(key)) {
				byElement.set(key, testCase);
			}
		}
		const irs = new Map();
		for (const tag of [...HOST_TAGS, COMPONENT]) {
			const classNames = [...byElement.values()]
				.filter((testCase) => testCase.label === tag)
				.map((testCase) => testCase.className);
			lowerAll(tag, classNames, configJson).forEach((ir, index) => {
				irs.set(`${tag}\0${classNames[index]}`, ir);
			});
		}
		for (const testCase of cases) {
			testCase.ir = irs.get(`${testCase.label}\0${testCase.className}`);
		}

		suites.push({ id, config: hostConfig(configJson), cases });
	}
	return suites;
}

function equal(left, right) {
	if (left === right) {
		return true;
	}
	if (typeof left === "number" && typeof right === "number") {
		return Math.abs(left - right) <= TOLERANCE;
	}
	if (Array.isArray(left) && Array.isArray(right)) {
		return (
			left.length === right.length &&
			left.every((item, index) => equal(item, right[index]))
		);
	}
	if (
		left &&
		right &&
		typeof left === "object" &&
		typeof right === "object" &&
		!Array.isArray(left) &&
		!Array.isArray(right)
	) {
		const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
		return [...keys].every((key) => equal(left[key], right[key]));
	}
	return false;
}

// Empty tables come back from Lune as arrays; absent and empty mean the same.
function entries(value) {
	return value && !Array.isArray(value) ? value : {};
}

function differences(testCase, expected, actual) {
	const out = [];
	const compare = (field, left, right) => {
		if (!equal(left ?? null, right ?? null)) {
			out.push({ path: field, expected: left ?? null, actual: right ?? null });
		}
	};

	const props = [entries(expected.props), entries(actual.props)];
	for (const name of new Set([
		...Object.keys(props[0]),
		...Object.keys(props[1]),
	])) {
		compare(`props.${name}`, props[0][name], props[1][name]);
	}

	const helpers = [entries(expected.helpers), entries(actual.helpers)];
	for (const tag of new Set([
		...Object.keys(helpers[0]),
		...Object.keys(helpers[1]),
	])) {
		const left = entries(helpers[0][tag]);
		const right = entries(helpers[1][tag]);
		for (const name of new Set([...Object.keys(left), ...Object.keys(right)])) {
			compare(`helpers.${tag}.${name}`, left[name], right[name]);
		}
	}

	for (const field of ["margin", "divide", "transition", "animation"]) {
		compare(field, expected[field], actual[field]);
	}
	compare("text.transform", expected.text?.transform, actual.text?.transform);
	compare(
		"text.decoration",
		expected.text?.decoration,
		actual.text?.decoration,
	);
	// A host tag's own alpha reaches its subtree through the emit's wrapper, not
	// through anything the static IR records, so only a component can be compared.
	if (testCase.tag === undefined) {
		compare("opacityAlpha", expected.opacityAlpha, actual.opacityAlpha);
	}
	return out;
}

function loadAllowlist() {
	const file = path.join(appRoot, "known-differences.json");
	const allowlist = JSON.parse(fs.readFileSync(file, "utf8"));
	const invalid = allowlist.filter(
		(entry) =>
			typeof entry.reason !== "string" ||
			entry.reason.trim() === "" ||
			!entry.match ||
			Object.keys(entry.match).length === 0,
	);
	if (invalid.length > 0) {
		throw new Error(
			`known-differences.json: every entry needs a non-empty match and reason:\n${JSON.stringify(invalid, null, 2)}`,
		);
	}
	return allowlist.map((entry) => ({
		...entry,
		used: 0,
		test: (testCase, difference) =>
			Object.entries(entry.match).every(([key, pattern]) => {
				const value =
					key === "path"
						? difference.path
						: key === "tag"
							? testCase.label
							: testCase[key];
				return new RegExp(pattern).test(String(value ?? ""));
			}),
	}));
}

function format(value) {
	return JSON.stringify(value);
}

async function main() {
	const lune = resolveLune();
	if (!lune) {
		const message =
			"parity-harness: lune was not found. Install it with `rokit install` in apps/parity-harness, or point LUNE at the binary.";
		if (process.env.CI) {
			console.error(message);
			process.exit(1);
		}
		console.warn(`${message} Skipping.`);
		return;
	}

	const runtimeOut = path.join(
		path.dirname(require.resolve("@rbxts/vela-runtime-core/package.json")),
		"out",
	);
	if (!fs.existsSync(path.join(runtimeOut, "init.luau"))) {
		throw new Error(
			`${runtimeOut} has no compiled runtime; build @rbxts/vela-runtime-core first.`,
		);
	}

	for (const spec of ["units.luau", "env.luau"]) {
		execFileSync(lune, ["run", path.join(appRoot, "lune", spec), runtimeOut], {
			stdio: "inherit",
			cwd: appRoot,
		});
	}

	const started = Date.now();
	const suites = await buildSuites();
	const lowered = Date.now();
	const cases = new Map();
	for (const suite of suites) {
		for (const testCase of suite.cases) {
			cases.set(testCase.id, testCase);
		}
	}

	const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vela-parity-"));
	const jobPath = path.join(workDir, "job.json");
	const resultPath = path.join(workDir, "result.json");
	fs.writeFileSync(jobPath, JSON.stringify({ out: runtimeOut, suites }));
	try {
		execFileSync(
			lune,
			["run", path.join(appRoot, "lune", "driver.luau"), jobPath, resultPath],
			{ stdio: "inherit", cwd: appRoot },
		);
	} catch (error) {
		fs.rmSync(workDir, { recursive: true, force: true });
		throw error;
	}
	const resolved = Date.now();
	const results = JSON.parse(fs.readFileSync(resultPath, "utf8"));
	fs.rmSync(workDir, { recursive: true, force: true });

	const allowlist = loadAllowlist();
	const failures = [];
	let allowed = 0;
	for (const result of results) {
		const testCase = cases.get(result.id);
		if (result.error) {
			failures.push({ testCase, path: "error", actual: result.error });
			continue;
		}
		for (const difference of differences(
			testCase,
			result.expected,
			result.actual,
		)) {
			const entry = allowlist.find((candidate) =>
				candidate.test(testCase, difference),
			);
			if (entry) {
				entry.used++;
				allowed++;
				continue;
			}
			failures.push({ testCase, ...difference });
		}
	}

	const lanes = {};
	for (const testCase of cases.values()) {
		lanes[testCase.lane] = (lanes[testCase.lane] ?? 0) + 1;
	}
	console.log(
		`parity-harness: ${results.length} cases (${Object.entries(lanes)
			.map(([lane, count]) => `${lane} ${count}`)
			.join(
				", ",
			)}): lowered in ${((lowered - started) / 1000).toFixed(1)}s, resolved in ${((resolved - lowered) / 1000).toFixed(1)}s, ${allowed} known differences allowed`,
	);

	for (const entry of allowlist) {
		if (entry.used === 0) {
			console.warn(
				`parity-harness: known difference never matched: ${format(entry.match)}`,
			);
		}
	}

	if (failures.length === 0) {
		return;
	}

	if (process.env.PARITY_REPORT) {
		fs.writeFileSync(
			process.env.PARITY_REPORT,
			JSON.stringify(
				failures.map(({ testCase, ...failure }) => ({
					config: testCase.config,
					lane: testCase.lane,
					env: testCase.envName,
					tag: testCase.label,
					className: testCase.className,
					...failure,
				})),
				null,
				1,
			),
		);
	}
	console.error(`parity-harness: ${failures.length} divergences`);
	for (const failure of failures.slice(0, MAX_REPORTED)) {
		const { testCase } = failure;
		console.error(
			[
				`  [${testCase.config}/${testCase.lane}${testCase.envName ? `@${testCase.envName}` : ""}] <${testCase.label}> "${testCase.className}"`,
				`    ${failure.path}`,
				...(failure.path === "error"
					? [`      ${failure.actual}`]
					: [
							`      static:  ${format(failure.expected)}`,
							`      runtime: ${format(failure.actual)}`,
						]),
			].join("\n"),
		);
	}
	if (failures.length > MAX_REPORTED) {
		const byPath = {};
		for (const failure of failures) {
			const key = failure.path.replace(/\d+/g, "#");
			byPath[key] = (byPath[key] ?? 0) + 1;
		}
		console.error(
			`  ... ${failures.length - MAX_REPORTED} more; by path: ${format(byPath)}`,
		);
	}
	process.exitCode = 1;
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
