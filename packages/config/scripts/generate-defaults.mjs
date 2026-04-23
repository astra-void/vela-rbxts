import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputPath = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../src/defaults.json",
);

const paletteOrder = [
	"slate",
	"gray",
	"zinc",
	"neutral",
	"stone",
	"red",
	"orange",
	"amber",
	"yellow",
	"lime",
	"green",
	"emerald",
	"teal",
	"cyan",
	"sky",
	"blue",
	"indigo",
	"violet",
	"purple",
	"fuchsia",
	"pink",
	"rose",
	"mauve",
	"olive",
	"mist",
	"taupe",
];

const radius = {
	none: "new UDim(0, 0)",
	xs: "new UDim(0, 2)",
	sm: "new UDim(0, 4)",
	md: "new UDim(0, 6)",
	lg: "new UDim(0, 8)",
	xl: "new UDim(0, 12)",
	"2xl": "new UDim(0, 16)",
	"3xl": "new UDim(0, 24)",
	"4xl": "new UDim(0, 32)",
	full: "new UDim(0.5, 0)",
};

const spacing = {
	"4": "new UDim(0, 16)",
};

const sourceUrl = "https://tailwindcss.com/docs/color";
const response = await fetch(sourceUrl, {
	headers: {
		"user-agent": "Mozilla/5.0",
	},
});

if (!response.ok) {
	throw new Error(`Failed to fetch ${sourceUrl}: ${response.status} ${response.statusText}`);
}

const html = await response.text();
const entries = new Map();

for (const match of html.matchAll(
	/var\(--color-([a-z]+)(?:-([0-9]+))?\)[^\n]*?\/\*\s*([^*]+?)\s*\*\//g,
)) {
	const family = match[1];
	const shade = match[2] ?? "";
	const value = match[3].trim();
	entries.set(`${family}:${shade}`, { family, shade, value });
}

const colors = new Map();

for (const { family, shade, value } of entries.values()) {
	const converted = convertColor(value);
	const existing = colors.get(family) ?? {};
	if (shade === "") {
		colors.set(family, converted);
		continue;
	}

	colors.set(family, {
		...existing,
		[shade]: converted,
	});
}

colors.set("black", "Color3.fromRGB(0, 0, 0)");
colors.set("white", "Color3.fromRGB(255, 255, 255)");

const orderedFamilies = [
	"black",
	"white",
	...paletteOrder.filter((family) => colors.has(family)),
];

const defaults = {
	theme: {
		colors: Object.fromEntries(
			orderedFamilies.map((family) => [family, colors.get(family)]),
		),
		radius,
		spacing,
	},
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(defaults, null, 2)}\n`);

function convertColor(value) {
	if (value.startsWith("Color3.fromRGB(")) {
		return value;
	}

	if (value.startsWith("#")) {
		const [r, g, b] = parseHexColor(value);
		return `Color3.fromRGB(${r}, ${g}, ${b})`;
	}

	if (value.startsWith("oklch(") && value.endsWith(")")) {
		const [lPart, cPart, hPart] = value
			.slice(6, -1)
			.trim()
			.split(/\s+/);
		const l = Number.parseFloat(lPart) / 100;
		const c = Number.parseFloat(cPart);
		const h = Number.parseFloat(hPart);
		const [r, g, b] = oklchToRgb(l, c, h);
		return `Color3.fromRGB(${r}, ${g}, ${b})`;
	}

	throw new Error(`Unsupported color syntax: ${value}`);
}

function parseHexColor(value) {
	const hex = value.slice(1);
	const normalized = hex.length === 3
		? hex
				.split("")
				.map((channel) => `${channel}${channel}`)
				.join("")
		: hex;

	if (normalized.length !== 6) {
		throw new Error(`Unsupported hex color: ${value}`);
	}

	return [
		Number.parseInt(normalized.slice(0, 2), 16),
		Number.parseInt(normalized.slice(2, 4), 16),
		Number.parseInt(normalized.slice(4, 6), 16),
	];
}

function oklchToRgb(l, c, h) {
	const radians = (h * Math.PI) / 180;
	const a = c * Math.cos(radians);
	const b = c * Math.sin(radians);

	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;

	const l3 = l_ ** 3;
	const m3 = m_ ** 3;
	const s3 = s_ ** 3;

	const linearRgb = [
		4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
		-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
		-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
	];

	return linearRgb.map((channel) =>
		Math.round(clamp01(gammaCorrect(channel)) * 255),
	);
}

function gammaCorrect(channel) {
	const clamped = clamp01(channel);
	if (clamped <= 0.0031308) {
		return 12.92 * clamped;
	}

	return 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function clamp01(value) {
	return Math.min(1, Math.max(0, value));
}
