import type {
	ColorInputMap,
	ColorPalette,
	TailwindConfigInput,
	ThemeConfigInput,
	ThemeScale,
	ThemeScreens,
} from "./index.js";
import { PALETTE_DEFAULT_KEY, SHADES } from "./index.js";
import {
	isValidPropName,
	isValidUtilityName,
	type PluginPropMap,
	type PluginUtilities,
	type ResolvedPluginsInput,
} from "./plugin.js";
import {
	isValidAttributeName,
	isValidVariantName,
	type PluginVariants,
	type VariantAttributeValue,
} from "./variants.js";

/** A parse failure, carrying offsets so an editor can point into the file. */
export type CssDiagnostic = {
	message: string;
	start: number;
	end: number;
};

export type CssImport = {
	specifier: string;
	start: number;
	end: number;
};

export type ParsedVelaCss = {
	/** Merges into the config chain the way a preset does. */
	input: TailwindConfigInput;
	/** `@import` specifiers in source order, for the loader to resolve. */
	imports: CssImport[];
	diagnostics: CssDiagnostic[];
};

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_PATTERN = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/i;
const LENGTH_PATTERN = /^(-?\d+(?:\.\d+)?)(px|%)?$/;
const COUNT_PATTERN = /^(\d+(?:\.\d+)?)(px)?$/;
const CUSTOM_PROPERTY_PATTERN = /^--([A-Za-z0-9][A-Za-z0-9-]*)$/;
const CLASS_SELECTOR_PATTERN = /^\.([A-Za-z0-9][A-Za-z0-9_-]*)$/;
const DECLARATION_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*([\s\S]+)$/;
const CUSTOM_DECLARATION_PATTERN = /^(--[A-Za-z0-9-]*)\s*:\s*([\s\S]+)$/;
const VARIANT_PATTERN = /^([A-Za-z0-9][A-Za-z0-9_-]*)\s*\(([\s\S]*)\)$/;
const CONDITION_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/;

const AT_RULES = ["@theme", "@custom-variant", "@import"];

/**
 * CSS properties whose names survive `isValidPropName` and would otherwise be
 * emitted as Roblox properties that do not exist. The trap this dialect has to
 * close: the syntax invites them and nothing downstream would catch them.
 */
const CSS_PROPERTY_HINTS: Record<string, string> = {
	background: "a background utility such as `bg-blue-500`",
	"background-color": "a background utility such as `bg-blue-500`",
	"border-radius": "a radius utility such as `rounded-md`",
	color: "a text color utility such as `text-white`",
	display: "a layout utility such as `flex`",
	"font-size": "a text size utility such as `text-lg`",
	height: "a sizing utility such as `h-32`",
	margin: "a margin utility such as `m-4`",
	opacity: "an opacity utility such as `opacity-50`",
	padding: "a padding utility such as `p-4`",
	width: "a sizing utility such as `w-32`",
};

const THEME_NAMESPACES = [
	"--color-*",
	"--spacing-*",
	"--radius-*",
	"--font-*",
	"--breakpoint-*",
];

export function parseVelaCss(source: string): ParsedVelaCss {
	return new VelaCssParser(source).parse();
}

class VelaCssParser {
	private readonly text: string;
	private index = 0;
	private readonly diagnostics: CssDiagnostic[] = [];
	private readonly colors = new Map<string, string | ColorPalette>();
	private readonly spacing: ThemeScale = {};
	private readonly radius: ThemeScale = {};
	private readonly fontFamily: ThemeScale = {};
	private readonly screens: ThemeScreens = {};
	private readonly utilities: PluginUtilities = {};
	private readonly variants: PluginVariants = {};
	private readonly imports: CssImport[] = [];

	constructor(source: string) {
		this.text = blankComments(source);
	}

	parse(): ParsedVelaCss {
		while (true) {
			this.skipTrivia();

			if (this.index >= this.text.length) {
				break;
			}

			const char = this.text[this.index];

			if (char === "@") {
				this.parseAtRule();
				continue;
			}

			if (char === ".") {
				this.parseClassRule();
				continue;
			}

			const start = this.index;
			this.recoverToStatementEnd();
			this.report(
				start,
				this.index,
				'Only "@theme", "@custom-variant", "@import", and single class rules such as ".btn { ... }" are supported here.',
			);
		}

		return {
			input: this.toConfigInput(),
			imports: this.imports,
			diagnostics: this.diagnostics,
		};
	}

	private parseAtRule(): void {
		const start = this.index;
		const nameEnd = this.scanWhile(
			(char) => /[A-Za-z-]/.test(char) || char === "@",
		);
		const name = this.text.slice(start, nameEnd);
		this.index = nameEnd;

		if (name === "@theme") {
			this.parseThemeBlock(start);
			return;
		}

		if (name === "@custom-variant") {
			this.parseCustomVariant(start);
			return;
		}

		if (name === "@import") {
			this.parseImport(start);
			return;
		}

		this.recoverToStatementEnd();
		this.report(
			start,
			this.index,
			`"${name}" is not supported. Vela CSS understands ${listOf(AT_RULES)}.`,
		);
	}

	private parseThemeBlock(start: number): void {
		const block = this.readBlock();

		if (!block) {
			this.report(start, this.index, '"@theme" needs a "{ ... }" block.');
			return;
		}

		for (const declaration of splitDeclarations(block.body, block.bodyStart)) {
			const match = CUSTOM_DECLARATION_PATTERN.exec(declaration.text.trim());
			const name = match?.[1];
			const rawValue = match?.[2];

			if (name === undefined || rawValue === undefined) {
				this.report(
					declaration.start,
					declaration.end,
					'A "@theme" block holds custom properties only, as "--color-brand-500: #3b82f6;".',
				);
				continue;
			}

			this.assignToken(name, rawValue, declaration.start, declaration.end);
		}
	}

	private assignToken(
		rawName: string,
		rawValue: string,
		start: number,
		end: number,
	): void {
		const nameMatch = CUSTOM_PROPERTY_PATTERN.exec(rawName.trim());
		const name = nameMatch?.[1];

		if (name === undefined) {
			this.report(start, end, `"${rawName.trim()}" is not a token name.`);
			return;
		}

		const value = rawValue.trim().replace(/;$/, "").trim();

		if (name === "rem" || name.startsWith("rem-")) {
			this.report(
				start,
				end,
				"The rem scale is not a token; set `theme.rem` in `vela.config.ts`.",
			);
			return;
		}

		if (name === "color" || name.startsWith("color-")) {
			this.assignColor(
				name.slice("color".length).replace(/^-/, ""),
				value,
				start,
				end,
			);
			return;
		}

		if (name === "spacing" || name.startsWith("spacing-")) {
			this.assignScale(
				this.spacing,
				"spacing",
				name.slice("spacing".length).replace(/^-/, ""),
				value,
				start,
				end,
			);
			return;
		}

		if (name === "radius" || name.startsWith("radius-")) {
			this.assignScale(
				this.radius,
				"radius",
				name.slice("radius".length).replace(/^-/, ""),
				value,
				start,
				end,
			);
			return;
		}

		if (name === "font" || name.startsWith("font-")) {
			const key =
				name.slice("font".length).replace(/^-/, "") || PALETTE_DEFAULT_KEY;

			if (value.length === 0) {
				this.report(start, end, `"--${name}" has no value.`);
				return;
			}

			this.fontFamily[key] = value;
			return;
		}

		if (name.startsWith("breakpoint-")) {
			const key = name.slice("breakpoint-".length);
			const count = COUNT_PATTERN.exec(value);
			const width = count?.[1] === undefined ? Number.NaN : Number(count[1]);

			if (key.length === 0 || !Number.isFinite(width)) {
				this.report(
					start,
					end,
					`"--${name}" needs a viewport width in pixels, as "--breakpoint-md: 768px;".`,
				);
				return;
			}

			this.screens[key] = width;
			return;
		}

		this.report(
			start,
			end,
			`"--${name}" is not a vela token. Token namespaces are ${listOf(THEME_NAMESPACES)}.`,
		);
	}

	private assignColor(
		rest: string,
		value: string,
		start: number,
		end: number,
	): void {
		const expression = colorExpression(value);

		if (expression === undefined) {
			this.report(
				start,
				end,
				`"${value}" is not a color. Write a hex literal, "rgb(r g b)", or a Color3 expression.`,
			);
			return;
		}

		const segments = rest.split("-");
		const last = segments[segments.length - 1];
		const hasShade = segments.length > 1 && last !== undefined && isShade(last);
		const name = hasShade ? segments.slice(0, -1).join("-") : rest;

		if (name.length === 0) {
			this.report(start, end, "A color token needs a name.");
			return;
		}

		const key = hasShade ? (last as string) : PALETTE_DEFAULT_KEY;
		const existing = this.colors.get(name);

		if (existing === undefined) {
			this.colors.set(name, hasShade ? { [key]: expression } : expression);
			return;
		}

		// A name written both bare and with shades becomes one palette, where the
		// bare value is the DEFAULT the compiler already resolves `bg-brand` to.
		const palette: ColorPalette =
			typeof existing === "string"
				? { [PALETTE_DEFAULT_KEY]: existing }
				: existing;
		palette[key as keyof ColorPalette] = expression;
		this.colors.set(name, palette);
	}

	private assignScale(
		scale: ThemeScale,
		namespace: string,
		rest: string,
		value: string,
		start: number,
		end: number,
	): void {
		const expression = udimExpression(value);

		if (expression === undefined) {
			this.report(
				start,
				end,
				`"${value}" is not a ${namespace} value. Write pixels ("16px"), a scale ("50%"), or a UDim expression.`,
			);
			return;
		}

		scale[rest.length === 0 ? PALETTE_DEFAULT_KEY : rest] = expression;
	}

	private parseCustomVariant(start: number): void {
		const end = this.scanToStatementEnd();
		const body = this.text.slice(this.index, end).trim();
		this.index = end < this.text.length ? end + 1 : end;

		const match = VARIANT_PATTERN.exec(body);
		const name = match?.[1];
		const condition = match?.[2];

		if (name === undefined || condition === undefined) {
			this.report(
				start,
				this.index,
				'A variant is written as "@custom-variant selected (Selected = true);".',
			);
			return;
		}

		if (!isValidVariantName(name)) {
			this.report(start, this.index, `"${name}" is not a usable class prefix.`);
			return;
		}

		const parts = CONDITION_PATTERN.exec(condition.trim());
		const attribute = parts?.[1];
		const rawValue = parts?.[2];

		if (attribute === undefined || rawValue === undefined) {
			this.report(
				start,
				this.index,
				`"${name}" needs a Roblox attribute to read, as "(Selected = true)".`,
			);
			return;
		}

		if (!isValidAttributeName(attribute)) {
			this.report(
				start,
				this.index,
				`"${attribute}" is not a Roblox attribute name.`,
			);
			return;
		}

		this.variants[name] = {
			attribute,
			equals: attributeValue(rawValue.trim()),
		};
	}

	private parseImport(start: number): void {
		const end = this.scanToStatementEnd();
		const body = this.text.slice(this.index, end).trim();
		this.index = end < this.text.length ? end + 1 : end;

		const quoted = /^["']([^"']+)["']$/.exec(body);
		const specifier = quoted?.[1];

		if (specifier === undefined) {
			this.report(
				start,
				this.index,
				"An import is written as \"@import './buttons.css';\".",
			);
			return;
		}

		this.imports.push({ specifier, start, end: this.index });
	}

	private parseClassRule(): void {
		const start = this.index;
		const braceIndex = this.text.indexOf("{", this.index);

		if (braceIndex === -1) {
			this.recoverToStatementEnd();
			this.report(start, this.index, 'A class rule needs a "{ ... }" block.');
			return;
		}

		const selector = this.text.slice(this.index, braceIndex).trim();
		this.index = braceIndex;
		const block = this.readBlock();

		if (!block) {
			this.report(start, this.index, 'A class rule needs a "{ ... }" block.');
			return;
		}

		const match = CLASS_SELECTOR_PATTERN.exec(selector);
		const name = match?.[1];

		if (name === undefined || !isValidUtilityName(name)) {
			this.report(
				start,
				braceIndex,
				`"${selector}" is not a supported selector. Vela has no cascade, so a rule names one class, as ".btn".`,
			);
			return;
		}

		const classes: string[] = [];
		const props: PluginPropMap = {};
		const failedBefore = this.diagnostics.length;

		for (const declaration of splitDeclarations(block.body, block.bodyStart)) {
			const text = declaration.text.trim();

			if (text.startsWith("@apply")) {
				const applied = text.slice("@apply".length).trim();

				if (applied.length === 0) {
					this.report(
						declaration.start,
						declaration.end,
						'"@apply" has no classes.',
					);
					continue;
				}

				classes.push(...applied.split(/\s+/));
				continue;
			}

			const property = DECLARATION_PATTERN.exec(text);
			const propName = property?.[1];
			const propValue = property?.[2];

			if (propName === undefined || propValue === undefined) {
				this.report(
					declaration.start,
					declaration.end,
					`"${text}" is neither an "@apply" nor a Roblox property assignment.`,
				);
				continue;
			}

			const hint = CSS_PROPERTY_HINTS[propName.toLowerCase()];

			if (hint !== undefined) {
				this.report(
					declaration.start,
					declaration.end,
					`"${propName}" is a CSS property, and vela styles Roblox instances. Use ${hint}.`,
				);
				continue;
			}

			// Roblox properties are PascalCase, so a lowercase name is a CSS
			// property this dialect would otherwise emit as a real assignment.
			if (!/^[A-Z]/.test(propName) || !isValidPropName(propName)) {
				this.report(
					declaration.start,
					declaration.end,
					`"${propName}" is not a Roblox property name; those are PascalCase, as "BackgroundTransparency".`,
				);
				continue;
			}

			props[propName] = propValue.trim();
		}

		if (classes.length > 0 && Object.keys(props).length > 0) {
			this.report(
				start,
				block.end,
				`".${name}" mixes "@apply" with property assignments. A utility is one or the other.`,
			);
			return;
		}

		if (classes.length > 0) {
			this.utilities[name] = classes.join(" ");
			return;
		}

		if (Object.keys(props).length > 0) {
			this.utilities[name] = props;
			return;
		}

		if (this.diagnostics.length === failedBefore) {
			this.report(start, block.end, `".${name}" is empty.`);
		}
	}

	private toConfigInput(): TailwindConfigInput {
		const extend: ThemeConfigInput["extend"] = {};

		if (this.colors.size > 0) {
			const colors: ColorInputMap = {};

			for (const [name, value] of this.colors) {
				colors[name] = value;
			}

			extend.colors = colors;
		}

		if (Object.keys(this.spacing).length > 0) {
			extend.spacing = this.spacing;
		}

		if (Object.keys(this.radius).length > 0) {
			extend.radius = this.radius;
		}

		if (Object.keys(this.fontFamily).length > 0) {
			extend.fontFamily = this.fontFamily;
		}

		if (Object.keys(this.screens).length > 0) {
			extend.screens = this.screens;
		}

		const plugins: ResolvedPluginsInput = {};

		if (Object.keys(this.utilities).length > 0) {
			plugins.utilities = this.utilities;
		}

		if (Object.keys(this.variants).length > 0) {
			plugins.variants = this.variants;
		}

		const input: TailwindConfigInput = {};

		if (Object.keys(extend).length > 0) {
			input.theme = { extend };
		}

		if (Object.keys(plugins).length > 0) {
			input.plugins = plugins;
		}

		return input;
	}

	private readBlock():
		| { body: string; bodyStart: number; end: number }
		| undefined {
		this.skipTrivia();

		if (this.text[this.index] !== "{") {
			this.recoverToStatementEnd();
			return undefined;
		}

		const bodyStart = this.index + 1;
		let depth = 0;
		let cursor = this.index;

		while (cursor < this.text.length) {
			const char = this.text[cursor];

			if (char === '"' || char === "'") {
				cursor = skipString(this.text, cursor);
				continue;
			}

			if (char === "{") {
				depth += 1;
			} else if (char === "}") {
				depth -= 1;

				if (depth === 0) {
					this.index = cursor + 1;
					return {
						body: this.text.slice(bodyStart, cursor),
						bodyStart,
						end: this.index,
					};
				}
			}

			cursor += 1;
		}

		this.index = this.text.length;
		return {
			body: this.text.slice(bodyStart),
			bodyStart,
			end: this.index,
		};
	}

	private scanWhile(predicate: (char: string) => boolean): number {
		let cursor = this.index;

		while (cursor < this.text.length) {
			const char = this.text[cursor];

			if (char === undefined || !predicate(char)) {
				break;
			}

			cursor += 1;
		}

		return cursor;
	}

	private scanToStatementEnd(): number {
		let cursor = this.index;

		while (cursor < this.text.length) {
			const char = this.text[cursor];

			if (char === '"' || char === "'") {
				cursor = skipString(this.text, cursor);
				continue;
			}

			if (char === ";" || char === "{" || char === "}") {
				break;
			}

			cursor += 1;
		}

		return cursor;
	}

	private recoverToStatementEnd(): void {
		const end = this.scanToStatementEnd();

		if (this.text[end] === "{") {
			this.index = end;
			this.readBlock();
			return;
		}

		this.index = end < this.text.length ? end + 1 : end;
	}

	private skipTrivia(): void {
		this.index = this.scanWhile((char) => /\s/.test(char));
	}

	private report(start: number, end: number, message: string): void {
		this.diagnostics.push({ message, start, end: Math.max(end, start) });
	}
}

function blankComments(source: string): string {
	let out = "";
	let cursor = 0;

	while (cursor < source.length) {
		if (source.startsWith("/*", cursor)) {
			const close = source.indexOf("*/", cursor + 2);
			const end = close === -1 ? source.length : close + 2;
			// Blanked rather than removed so every offset still points at the source.
			out += source.slice(cursor, end).replace(/[^\n]/g, " ");
			cursor = end;
			continue;
		}

		const char = source[cursor] as string;

		if (char === '"' || char === "'") {
			const end = skipString(source, cursor);
			out += source.slice(cursor, end);
			cursor = end;
			continue;
		}

		out += char;
		cursor += 1;
	}

	return out;
}

function skipString(source: string, start: number): number {
	const quote = source[start];
	let cursor = start + 1;

	while (cursor < source.length) {
		const char = source[cursor];

		if (char === "\\") {
			cursor += 2;
			continue;
		}

		if (char === quote) {
			return cursor + 1;
		}

		cursor += 1;
	}

	return source.length;
}

type Declaration = {
	text: string;
	start: number;
	end: number;
};

function splitDeclarations(body: string, offset: number): Declaration[] {
	const declarations: Declaration[] = [];
	let start = 0;
	let cursor = 0;
	let depth = 0;

	// The span skips the whitespace around a declaration, so a diagnostic points
	// at the declaration rather than at the line break before it.
	const push = (end: number) => {
		const text = body.slice(start, end);
		const leading = text.length - text.trimStart().length;
		const trailing = text.length - text.trimEnd().length;

		if (text.trim().length > 0) {
			declarations.push({
				text,
				start: offset + start + leading,
				end: offset + end - trailing,
			});
		}
	};

	while (cursor < body.length) {
		const char = body[cursor];

		if (char === '"' || char === "'") {
			cursor = skipString(body, cursor);
			continue;
		}

		if (char === "(" || char === "{") {
			depth += 1;
		} else if (char === ")" || char === "}") {
			depth -= 1;
		} else if (char === ";" && depth === 0) {
			push(cursor);
			start = cursor + 1;
		}

		cursor += 1;
	}

	push(body.length);

	return declarations;
}

function colorExpression(value: string): string | undefined {
	if (value.startsWith("Color3.")) {
		return value;
	}

	const hex = HEX_PATTERN.exec(value);
	const digits = hex?.[1];

	if (digits !== undefined) {
		const full =
			digits.length === 3
				? digits
						.split("")
						.map((digit) => `${digit}${digit}`)
						.join("")
				: digits;
		const red = Number.parseInt(full.slice(0, 2), 16);
		const green = Number.parseInt(full.slice(2, 4), 16);
		const blue = Number.parseInt(full.slice(4, 6), 16);

		return `Color3.fromRGB(${red}, ${green}, ${blue})`;
	}

	const rgb = RGB_PATTERN.exec(value);

	if (rgb) {
		return `Color3.fromRGB(${Number(rgb[1])}, ${Number(rgb[2])}, ${Number(rgb[3])})`;
	}

	return undefined;
}

function udimExpression(value: string): string | undefined {
	if (value.startsWith("new UDim")) {
		return value;
	}

	const match = LENGTH_PATTERN.exec(value);
	const amount = match?.[1] === undefined ? Number.NaN : Number(match[1]);

	if (!Number.isFinite(amount)) {
		return undefined;
	}

	if (match?.[2] === "%") {
		return `new UDim(${amount / 100}, 0)`;
	}

	// A bare number is only unambiguous at zero; everything else states a unit.
	if (match?.[2] === undefined && amount !== 0) {
		return undefined;
	}

	return `new UDim(0, ${amount})`;
}

function attributeValue(raw: string): VariantAttributeValue {
	if (raw === "true") {
		return true;
	}

	if (raw === "false") {
		return false;
	}

	const quoted = /^["']([\s\S]*)["']$/.exec(raw);

	if (quoted?.[1] !== undefined) {
		return quoted[1];
	}

	const numeric = Number(raw);

	return Number.isFinite(numeric) && raw.length > 0 ? numeric : raw;
}

function isShade(segment: string): boolean {
	return (SHADES as readonly number[]).some(
		(shade) => String(shade) === segment,
	);
}

function listOf(items: readonly string[]): string {
	return items.map((item) => `"${item}"`).join(", ");
}
