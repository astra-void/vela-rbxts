import React from "@rbxts/react";
import { UserInputService, Workspace } from "@rbxts/services";

import type { TailwindConfig } from "@rbxts-tailwind/config";
import type { ClassValue } from "@rbxts-tailwind/types";

type Color3 = object;

declare const Color3: {
	fromRGB(red: number, green: number, blue: number): Color3;
};

declare class UDim {
	constructor(scale: number, offset: number);
	Scale: number;
	Offset: number;
}

declare class UDim2 {
	constructor(xScale: number, xOffset: number, yScale: number, yOffset: number);
	static fromOffset(x: number, y: number): UDim2;
	static fromScale(x: number, y: number): UDim2;
}

interface RBXScriptConnection {
	Disconnect(): void;
}

interface RBXScriptSignal {
	Connect(callback: () => void): RBXScriptConnection;
}

interface Vector2 {
	X: number;
	Y: number;
}

interface RuntimeCamera {
	ViewportSize: Vector2;
	GetPropertyChangedSignal(property: "ViewportSize"): RBXScriptSignal;
}

type SupportedHostElementTag =
	| "frame"
	| "scrollingframe"
	| "canvasgroup"
	| "textlabel"
	| "textbutton"
	| "textbox"
	| "imagelabel"
	| "imagebutton";

type RuntimeRulePropEntry = {
	name: string;
	value: string;
};

type RuntimeRuleHelperEntry = {
	tag: string;
	props: RuntimeRulePropEntry[];
};

type RuntimeEffectBundle = {
	props: RuntimeRulePropEntry[];
	helpers: RuntimeRuleHelperEntry[];
};

type RuntimeResolvedPropEntry = {
	name: string;
	value: RuntimePropValue;
};

type RuntimeResolvedHelperEntry = {
	tag: string;
	props: RuntimeResolvedPropEntry[];
};

type RuntimeResolvedEffectBundle = {
	props: RuntimeResolvedPropEntry[];
	helpers: RuntimeResolvedHelperEntry[];
};

type RuntimeCondition =
	| {
			kind: "all";
			conditions: RuntimeCondition[];
	  }
	| {
			kind: "width";
			alias: "sm" | "md" | "lg";
			minWidth: number;
			maxWidth?: number;
	  }
	| {
			kind: "orientation";
			value: "portrait" | "landscape";
	  }
	| {
			kind: "input";
			value: "touch" | "mouse" | "gamepad";
	  };

type RuntimeRule = {
	condition: RuntimeCondition;
	effects: RuntimeEffectBundle;
};

type RuntimeTheme = {
	colors: Record<string, RuntimeColorScale>;
	radius: Record<string, UDim>;
	spacing: Record<string, UDim>;
};

type RuntimeColorScale = Record<string, Color3>;

type RuntimeEnvironment = {
	width: number;
	orientation: "portrait" | "landscape";
	input: "touch" | "mouse" | "gamepad";
};

type RuntimePropValue = string | number | boolean | Color3 | UDim | UDim2;

type RuntimePropMap = Record<string, RuntimePropValue>;

type RuntimeHelperProp = {
	name: string;
	value: RuntimePropValue;
};

type RuntimeHelper = {
	tag: string;
	props: RuntimeHelperProp[];
};

type RuntimeResolution = {
	props: RuntimePropMap;
	helpers: RuntimeHelper[];
};

export type TailwindRuntimeHostProps = {
	__rbxtsTailwindTag: SupportedHostElementTag;
	__rbxtsTailwindRules?: readonly RuntimeRule[];
	className?: ClassValue;
	children?: React.ReactNode;
} & Record<string, unknown>;

export function createTailwindRuntimeHost(config: TailwindConfig) {
	const theme = normalizeTheme(config);

	return function TailwindRuntimeHost(props: TailwindRuntimeHostProps) {
		const environment = useRuntimeEnvironment();
		const {
			__rbxtsTailwindTag,
			__rbxtsTailwindRules = [],
			className,
			children,
			...rest
		} = props;

		const resolution = resolveRuntimeResolution(
			theme,
			environment,
			__rbxtsTailwindRules as RuntimeRule[],
			className,
		);
		const hostProps: Record<string, unknown> = {
			...rest,
			...resolution.props,
		};
		const runtimeChildren = resolution.helpers.map((helper) =>
			React.createElement(helper.tag, helperToProps(helper.props)),
		);

		return React.createElement(
			__rbxtsTailwindTag,
			hostProps,
			...runtimeChildren,
			...normalizeChildren(children),
		);
	};
}

function useRuntimeEnvironment(): RuntimeEnvironment {
	const [camera, setCamera] = React.useState(
		() => Workspace.CurrentCamera as RuntimeCamera | undefined,
	);
	const [environment, setEnvironment] = React.useState(() =>
		readRuntimeEnvironment(camera),
	);

	React.useEffect(() => {
		const updateCamera = () => setCamera(Workspace.CurrentCamera);
		const connection =
			Workspace.GetPropertyChangedSignal("CurrentCamera").Connect(updateCamera);

		return () => {
			connection.Disconnect();
		};
	}, []);

	React.useEffect(() => {
		const updateEnvironment = () =>
			setEnvironment(readRuntimeEnvironment(camera));

		updateEnvironment();

		const connections = [
			UserInputService.GetPropertyChangedSignal("TouchEnabled").Connect(
				updateEnvironment,
			),
			UserInputService.GetPropertyChangedSignal("MouseEnabled").Connect(
				updateEnvironment,
			),
			UserInputService.GetPropertyChangedSignal("GamepadEnabled").Connect(
				updateEnvironment,
			),
		];

		if (camera) {
			connections.push(
				camera
					.GetPropertyChangedSignal("ViewportSize")
					.Connect(updateEnvironment),
			);
		}

		return () => {
			for (const connection of connections) {
				connection.Disconnect();
			}
		};
	}, [camera]);

	return environment;
}

function readRuntimeEnvironment(
	camera: RuntimeCamera | undefined,
): RuntimeEnvironment {
	const viewportSize = camera?.ViewportSize;
	const width = viewportSize?.X ?? 0;
	const height = viewportSize?.Y ?? 0;

	return {
		width,
		orientation: width >= height ? "landscape" : "portrait",
		input: detectInputMode(),
	};
}

function detectInputMode(): RuntimeEnvironment["input"] {
	if (UserInputService.GamepadEnabled) {
		return "gamepad";
	}

	if (UserInputService.TouchEnabled) {
		return "touch";
	}

	return "mouse";
}

function normalizeTheme(config: TailwindConfig): RuntimeTheme {
	return {
		colors: normalizeColorRegistry(config.theme.colors),
		radius: normalizeRadiusScale(config.theme.radius),
		spacing: normalizeSpacingScale(config.theme.spacing),
	};
}

function normalizeColorRegistry(
	registry: Record<string, Record<string, string>>,
): Record<string, RuntimeColorScale> {
	const normalized: Record<string, RuntimeColorScale> = {};

	for (const key in registry) {
		normalized[key] = normalizeColorScale(registry[key]);
	}

	return normalized;
}

function normalizeColorScale(scale: Record<string, string>): RuntimeColorScale {
	const normalized: RuntimeColorScale = {};

	for (const key in scale) {
		const value = parseColor3(scale[key]);
		if (value) {
			normalized[key] = value;
		}
	}

	return normalized;
}

function normalizeRadiusScale(
	scale: Record<string, string>,
): Record<string, UDim> {
	const normalized: Record<string, UDim> = {};

	for (const key in scale) {
		normalized[key] = parseUDim(scale[key]) ?? new UDim(0, 0);
	}

	return normalized;
}

function normalizeSpacingScale(
	scale: Record<string, string>,
): Record<string, UDim> {
	const normalized: Record<string, UDim> = {};

	for (const key in scale) {
		normalized[key] = parseUDim(scale[key]) ?? new UDim(0, 0);
	}

	return normalized;
}

function resolveRuntimeResolution(
	theme: RuntimeTheme,
	environment: RuntimeEnvironment,
	runtimeRules: readonly RuntimeRule[],
	className: ClassValue | undefined,
): RuntimeResolution {
	const resolution: RuntimeResolution = {
		props: {},
		helpers: [],
	};

	for (const rule of runtimeRules) {
		if (matchesRuntimeCondition(rule.condition, environment)) {
			applyEffectBundle(resolution, rule.effects);
		}
	}

	for (const token of normalizeClassValue(className)) {
		applyToken(theme, environment, token, resolution);
	}

	return resolution;
}

function applyToken(
	theme: RuntimeTheme,
	environment: RuntimeEnvironment,
	token: string,
	resolution: RuntimeResolution,
) {
	if (!token) {
		return;
	}

	const segments = token.split(":");
	const utility = segments.pop();
	if (!utility) {
		return;
	}

	if (!segments.every((segment) => matchesVariant(segment, environment))) {
		return;
	}

	const effect = resolveUtilityToken(theme, utility);
	if (!effect) {
		return;
	}

	applyResolvedEffectBundle(resolution, effect);
}

function matchesVariant(
	prefix: string,
	environment: RuntimeEnvironment,
): boolean {
	switch (prefix) {
		case "sm":
			return environment.width >= 640;
		case "md":
			return environment.width >= 768;
		case "lg":
			return environment.width >= 1024;
		case "portrait":
			return environment.orientation === "portrait";
		case "landscape":
			return environment.orientation === "landscape";
		case "touch":
			return environment.input === "touch";
		case "mouse":
			return environment.input === "mouse";
		case "gamepad":
			return environment.input === "gamepad";
		default:
			return false;
	}
}

function matchesRuntimeCondition(
	condition: RuntimeCondition,
	environment: RuntimeEnvironment,
): boolean {
	switch (condition.kind) {
		case "all":
			return condition.conditions.every((entry) =>
				matchesRuntimeCondition(entry, environment),
			);
		case "width":
			return (
				environment.width >= condition.minWidth &&
				(condition.maxWidth === undefined ||
					environment.width <= condition.maxWidth)
			);
		case "orientation":
			return environment.orientation === condition.value;
		case "input":
			return environment.input === condition.value;
		default:
			return false;
	}
}

function resolveUtilityToken(
	theme: RuntimeTheme,
	token: string,
): RuntimeResolvedEffectBundle | undefined {
	if (token.startsWith("bg-")) {
		const key = token.slice(3);
		const [colorName, shade] = splitColorKey(key);
		if (colorName === "transparent") {
			return {
				props: [{ name: "BackgroundTransparency", value: 1 }],
				helpers: [],
			};
		}

		const value = theme.colors[colorName]?.[shade];
		if (!value) {
			return undefined;
		}

		return {
			props: [{ name: "BackgroundColor3", value }],
			helpers: [],
		};
	}

	if (token.startsWith("rounded-")) {
		const key = token.slice("rounded-".length);
		const value = resolveRadiusValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uicorner",
					props: [{ name: "CornerRadius", value }],
				},
			],
		};
	}

	if (token.startsWith("p-")) {
		const key = token.slice(2);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [
						{ name: "PaddingTop", value },
						{ name: "PaddingRight", value },
						{ name: "PaddingBottom", value },
						{ name: "PaddingLeft", value },
					],
				},
			],
		};
	}

	if (token.startsWith("px-")) {
		const key = token.slice(3);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [
						{ name: "PaddingLeft", value },
						{ name: "PaddingRight", value },
					],
				},
			],
		};
	}

	if (token.startsWith("py-")) {
		const key = token.slice(3);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [
						{ name: "PaddingTop", value },
						{ name: "PaddingBottom", value },
					],
				},
			],
		};
	}

	if (token.startsWith("pt-")) {
		const key = token.slice(3);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [{ name: "PaddingTop", value }],
				},
			],
		};
	}

	if (token.startsWith("pr-")) {
		const key = token.slice(3);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [{ name: "PaddingRight", value }],
				},
			],
		};
	}

	if (token.startsWith("pb-")) {
		const key = token.slice(3);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [{ name: "PaddingBottom", value }],
				},
			],
		};
	}

	if (token.startsWith("pl-")) {
		const key = token.slice(3);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uipadding",
					props: [{ name: "PaddingLeft", value }],
				},
			],
		};
	}

	if (token.startsWith("gap-")) {
		const key = token.slice(4);
		const value = resolveSpacingValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uilistlayout",
					props: [{ name: "Padding", value }],
				},
			],
		};
	}

	if (token.startsWith("w-")) {
		const key = token.slice(2);
		const value = resolveSizeAxisValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [{ name: "Size", value: formatSizeProp(value, null) }],
			helpers: [],
		};
	}

	if (token.startsWith("h-")) {
		const key = token.slice(2);
		const value = resolveSizeAxisValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [{ name: "Size", value: formatSizeProp(null, value) }],
			helpers: [],
		};
	}

	if (token.startsWith("size-")) {
		const key = token.slice("size-".length);
		const value = resolveSizeAxisValue(theme, key);
		if (!value) {
			return undefined;
		}

		return {
			props: [{ name: "Size", value: formatSizeProp(value, value) }],
			helpers: [],
		};
	}

	return undefined;
}

function splitColorKey(key: string): [string, string] {
	const lastDash = key.lastIndexOf("-");
	if (lastDash === -1) {
		return [key, "500"];
	}

	const suffix = key.slice(lastDash + 1);
	if (isColorShade(suffix)) {
		return [key.slice(0, lastDash), suffix];
	}

	return [key, "500"];
}

function isColorShade(value: string): boolean {
	return (
		value === "50" ||
		value === "100" ||
		value === "200" ||
		value === "300" ||
		value === "400" ||
		value === "500" ||
		value === "600" ||
		value === "700" ||
		value === "800" ||
		value === "900" ||
		value === "950"
	);
}

function resolveRadiusValue(
	theme: RuntimeTheme,
	key: string,
): UDim | undefined {
	return theme.radius[key] ?? resolveArbitraryUDim(key);
}

function resolveSpacingValue(
	theme: RuntimeTheme,
	key: string,
): UDim | undefined {
	return (
		theme.spacing[key] ??
		resolveArbitraryUDim(key) ??
		resolveNumericSpacingValue(key)
	);
}

function resolveSizeAxisValue(
	theme: RuntimeTheme,
	key: string,
): { scale: number; offset: number } | undefined {
	if (key === "px") {
		return { scale: 0, offset: 1 };
	}

	if (key === "full") {
		return { scale: 1, offset: 0 };
	}

	if (key === "fit") {
		return undefined;
	}

	const fraction = resolveFractionScale(key);
	if (fraction !== undefined) {
		return { scale: fraction, offset: 0 };
	}

	const spacing = resolveSpacingValue(theme, key);
	if (spacing) {
		if (spacing.Scale !== 0) {
			return undefined;
		}

		return { scale: 0, offset: spacing.Offset };
	}

	return resolveArbitrarySizeValue(key);
}

function resolveArbitraryUDim(key: string): UDim | undefined {
	const numeric = parseBracketNumericValue(key);
	if (numeric === undefined) {
		return undefined;
	}

	return new UDim(0, numeric);
}

function resolveArbitrarySizeValue(
	key: string,
): { scale: number; offset: number } | undefined {
	const numeric = parseBracketNumericValue(key);
	if (numeric === undefined) {
		return undefined;
	}

	return { scale: 0, offset: numeric };
}

function resolveNumericSpacingValue(key: string): UDim | undefined {
	if (key.startsWith("-") || key.startsWith("+")) {
		return undefined;
	}

	const numeric = Number(key);
	if (!Number.isFinite(numeric) || numeric < 0) {
		return undefined;
	}

	if (!isWholeNumber(numeric * 2)) {
		return undefined;
	}

	return new UDim(0, numeric * 4);
}

function resolveFractionScale(key: string): number | undefined {
	const [numeratorText, denominatorText] = key.split("/");
	if (denominatorText === undefined) {
		return undefined;
	}

	const numerator = Number(numeratorText);
	const denominator = Number(denominatorText);
	if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
		return undefined;
	}

	if (!isWholeNumber(numerator) || !isWholeNumber(denominator)) {
		return undefined;
	}

	const wholeNumerator = Math.floor(numerator);
	const wholeDenominator = Math.floor(denominator);
	const isSupported =
		(wholeDenominator === 2 && wholeNumerator === 1) ||
		(wholeDenominator === 3 &&
			(wholeNumerator === 1 || wholeNumerator === 2)) ||
		(wholeDenominator === 4 &&
			(wholeNumerator === 1 || wholeNumerator === 3)) ||
		(wholeDenominator === 5 &&
			(wholeNumerator === 1 ||
				wholeNumerator === 2 ||
				wholeNumerator === 3 ||
				wholeNumerator === 4)) ||
		(wholeDenominator === 6 &&
			(wholeNumerator === 1 || wholeNumerator === 5)) ||
		(wholeDenominator === 12 && wholeNumerator >= 1 && wholeNumerator <= 11);

	if (!isSupported) {
		return undefined;
	}

	return wholeNumerator / wholeDenominator;
}

function formatSizeProp(
	width: { scale: number; offset: number } | null,
	height: { scale: number; offset: number } | null,
): UDim2 {
	const resolvedWidth = width ?? { scale: 0, offset: 0 };
	const resolvedHeight = height ?? { scale: 0, offset: 0 };

	if (resolvedWidth.scale === 0 && resolvedHeight.scale === 0) {
		return UDim2.fromOffset(resolvedWidth.offset, resolvedHeight.offset);
	}

	if (resolvedWidth.offset === 0 && resolvedHeight.offset === 0) {
		return UDim2.fromScale(resolvedWidth.scale, resolvedHeight.scale);
	}

	return new UDim2(
		resolvedWidth.scale,
		resolvedWidth.offset,
		resolvedHeight.scale,
		resolvedHeight.offset,
	);
}

function parseBracketNumericValue(key: string): number | undefined {
	if (!key.startsWith("[") || !key.endsWith("]")) {
		return undefined;
	}

	const value = key.slice(1, -1);
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric < 0) {
		return undefined;
	}

	return numeric;
}

function parseColor3(value: string): Color3 | undefined {
	const match = value.match(
		/^Color3\.fromRGB\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/,
	);
	if (!match) {
		return undefined;
	}

	const red = Number(match[1]);
	const green = Number(match[2]);
	const blue = Number(match[3]);

	if (![red, green, blue].every((channel) => channel >= 0 && channel <= 255)) {
		return undefined;
	}

	return Color3.fromRGB(red, green, blue);
}

function parseUDim(value: string): UDim | undefined {
	const match = value.match(
		/^new UDim\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/,
	);
	if (!match) {
		return undefined;
	}

	return new UDim(Number(match[1]) || 0, Number(match[2]) || 0);
}

function normalizeClassValue(value: ClassValue | undefined): string[] {
	const tokens: string[] = [];

	const visit = (entry: ClassValue | undefined): void => {
		if (entry === undefined || entry === null || entry === false) {
			return;
		}

		if (typeof entry === "string" || typeof entry === "number") {
			for (const token of String(entry).split(/\s+/)) {
				if (token.length > 0) {
					tokens.push(token);
				}
			}
			return;
		}

		if (typeof entry === "boolean") {
			return;
		}

		if (Array.isArray(entry)) {
			for (const item of entry) {
				visit(item as ClassValue);
			}
			return;
		}

		if (typeof entry === "object") {
			for (const key in entry as Record<string, unknown>) {
				if ((entry as Record<string, unknown>)[key]) {
					tokens.push(key);
				}
			}
		}
	};

	visit(value);
	return tokens;
}

function normalizeChildren(
	children: React.ReactNode | undefined,
): React.ReactNode[] {
	if (children === undefined || children === null || children === false) {
		return [];
	}

	if (children === true) {
		return [];
	}

	if (Array.isArray(children)) {
		const flattened: React.ReactNode[] = [];
		for (const child of children) {
			flattened.push(...normalizeChildren(child));
		}
		return flattened;
	}

	return [children];
}

function applyEffectBundle(
	resolution: RuntimeResolution,
	effects: RuntimeEffectBundle,
) {
	for (const prop of effects.props) {
		setProp(resolution.props, prop.name, parseRuntimePropValue(prop.value));
	}

	for (const helper of effects.helpers) {
		setHelperProp(resolution.helpers, helper.tag, helper.props);
	}
}

function applyResolvedEffectBundle(
	resolution: RuntimeResolution,
	effects: RuntimeResolvedEffectBundle,
) {
	for (const prop of effects.props) {
		setProp(resolution.props, prop.name, prop.value);
	}

	for (const helper of effects.helpers) {
		setResolvedHelperProp(resolution.helpers, helper.tag, helper.props);
	}
}

function setProp(props: RuntimePropMap, name: string, value: RuntimePropValue) {
	delete props[name];
	props[name] = value;
}

function setHelperProp(
	helpers: RuntimeHelper[],
	tag: string,
	props: RuntimeRulePropEntry[],
) {
	const existing = helpers.find((helper) => helper.tag === tag);
	if (existing) {
		for (const prop of props) {
			setHelperEntryProp(
				existing.props,
				prop.name,
				parseRuntimePropValue(prop.value),
			);
		}
		return;
	}

	helpers.push({
		tag,
		props: props.map((prop) => ({
			name: prop.name,
			value: parseRuntimePropValue(prop.value),
		})),
	});
}

function setResolvedHelperProp(
	helpers: RuntimeHelper[],
	tag: string,
	props: RuntimeResolvedPropEntry[],
) {
	const existing = helpers.find((helper) => helper.tag === tag);
	if (existing) {
		for (const prop of props) {
			setHelperEntryProp(existing.props, prop.name, prop.value);
		}
		return;
	}

	helpers.push({
		tag,
		props: props.map((prop) => ({ ...prop })),
	});
}

function setHelperEntryProp(
	props: RuntimeHelperProp[],
	name: string,
	value: RuntimePropValue,
) {
	const existing = props.find((prop) => prop.name === name);
	if (existing) {
		existing.value = value;
		return;
	}

	props.push({ name, value });
}

function helperToProps(props: RuntimeHelperProp[]): Record<string, unknown> {
	const resolved: Record<string, unknown> = {};

	for (const prop of props) {
		resolved[prop.name] = prop.value;
	}

	return resolved;
}

function parseRuntimePropValue(value: string): RuntimePropValue {
	const trimmed = value.trim();

	const color = parseColor3(trimmed);
	if (color) {
		return color;
	}

	const udim = parseUDim(trimmed);
	if (udim) {
		return udim;
	}

	const udim2 = parseUDim2(trimmed);
	if (udim2) {
		return udim2;
	}

	if (trimmed === "true") {
		return true;
	}

	if (trimmed === "false") {
		return false;
	}

	const numeric = Number(trimmed);
	if (Number.isFinite(numeric) && trimmed.length > 0) {
		return numeric;
	}

	return value;
}

function parseUDim2(value: string): UDim2 | undefined {
	const fromOffset = value.match(
		/^UDim2\.fromOffset\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/,
	);
	if (fromOffset) {
		return UDim2.fromOffset(
			Number(fromOffset[1]) || 0,
			Number(fromOffset[2]) || 0,
		);
	}

	const fromScale = value.match(
		/^UDim2\.fromScale\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/,
	);
	if (fromScale) {
		return UDim2.fromScale(
			Number(fromScale[1]) || 0,
			Number(fromScale[2]) || 0,
		);
	}

	const constructed = value.match(
		/^UDim2\.new\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/,
	);
	if (!constructed) {
		return undefined;
	}

	return new UDim2(
		Number(constructed[1]) || 0,
		Number(constructed[2]) || 0,
		Number(constructed[3]) || 0,
		Number(constructed[4]) || 0,
	);
}

function isWholeNumber(value: number): boolean {
	const rounded = Math.round(value);
	return Math.abs(value - rounded) < 1e-9;
}
