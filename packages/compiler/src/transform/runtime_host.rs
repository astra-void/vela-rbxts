use crate::config::model::TailwindConfig;
use crate::swc::parse::parse_module_items;
use swc_core::ecma::ast::ModuleItem;

const RUNTIME_HOST_TEMPLATE: &str = r###"
import __VelaReact from "@rbxts/react";
import { UserInputService as __VelaUserInputService, Workspace as __VelaWorkspace } from "@rbxts/services";

type ClassDictionary = Record<string, boolean | null | undefined>;
type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| ClassDictionary
	| ClassValue[];

type VelaRuntimeConfig = {
	theme: {
		colors: Record<string, string | Record<string, string>>;
		radius: Record<string, string>;
		spacing: Record<string, string>;
	};
};

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
	colors: Record<string, RuntimeColorEntry>;
	radius: Record<string, UDim>;
	spacing: Record<string, UDim>;
};

type RuntimeColorEntry = string | RuntimeColorScale;

type RuntimeColorScale = Record<string, Color3>;

type RuntimeSizeAxisValue = {
	scale: number;
	offset: number;
};

type RuntimeEnvironment = {
	width: number;
	orientation: "portrait" | "landscape";
	input: "touch" | "mouse" | "gamepad";
};

type RuntimeCamera = {
	ViewportSize?: {
		X: number;
		Y: number;
	};
	GetPropertyChangedSignal(property: "ViewportSize"): unknown;
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

type VelaRuntimeHostProps = {
	__velaTag: SupportedHostElementTag;
	__velaRules?: readonly RuntimeRule[];
	className?: ClassValue;
	children?: defined | readonly defined[];
} & Record<string, unknown>;

function __createVelaRuntimeHost(config: VelaRuntimeConfig) {
	const theme = normalizeTheme(config);

	return (props: VelaRuntimeHostProps) => {
		const environment = useRuntimeEnvironment();
		const __velaTag = props.__velaTag;
		const __velaRules = props.__velaRules ?? [];
		const className = props.className;
		const children = props.children;

		const resolution = resolveRuntimeResolution(
			theme,
			environment,
			__velaRules as RuntimeRule[],
			className,
		);
		const hostProps: Record<string, unknown> = {};
		for (const [name, value] of pairs(props as Record<string, unknown>)) {
			if (
				name !== "__velaTag" &&
				name !== "__velaRules" &&
				name !== "className" &&
				name !== "children"
			) {
				hostProps[name] = value;
			}
		}
		for (const [name, value] of pairs(resolution.props)) {
			hostProps[name] = value;
		}
		const runtimeChildren = resolution.helpers.map((helper) =>
			__VelaReact.createElement(helper.tag, helperToProps(helper.props)),
		);
		const allChildren: defined[] = [];
		for (const child of runtimeChildren) {
			if (child !== undefined) {
				allChildren.push(child);
			}
		}
		for (const child of normalizeChildren(children)) {
			if (child !== undefined) {
				allChildren.push(child);
			}
		}

		return __VelaReact.createElement(__velaTag, hostProps, ...allChildren);
	};
}

function useRuntimeEnvironment(): RuntimeEnvironment {
	const [camera, setCamera] = __VelaReact.useState(
		() => __VelaWorkspace.CurrentCamera as RuntimeCamera | undefined,
	);
	const [environment, setEnvironment] = __VelaReact.useState(() =>
		readRuntimeEnvironment(camera),
	);

	__VelaReact.useEffect(() => {
		const updateCamera = () =>
			setCamera(__VelaWorkspace.CurrentCamera as RuntimeCamera | undefined);
		const connection = __VelaWorkspace.GetPropertyChangedSignal(
			"CurrentCamera",
		).Connect(updateCamera);

		return () => {
			connection.Disconnect();
		};
	}, []);

	__VelaReact.useEffect(() => {
		const updateEnvironment = () =>
			setEnvironment(readRuntimeEnvironment(camera));

		updateEnvironment();

		const connections = [
			__VelaUserInputService.GetPropertyChangedSignal("TouchEnabled").Connect(
				updateEnvironment,
			),
			__VelaUserInputService.GetPropertyChangedSignal("MouseEnabled").Connect(
				updateEnvironment,
			),
			__VelaUserInputService.GetPropertyChangedSignal("GamepadEnabled").Connect(
				updateEnvironment,
			),
		];

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
	if (__VelaUserInputService.GamepadEnabled) {
		return "gamepad";
	}

	if (__VelaUserInputService.TouchEnabled) {
		return "touch";
	}

	return "mouse";
}

function normalizeTheme(config: VelaRuntimeConfig): RuntimeTheme {
	return {
		colors: normalizeColorRegistry(config.theme.colors),
		radius: normalizeRadiusScale(config.theme.radius),
		spacing: normalizeSpacingScale(config.theme.spacing),
	};
}

function normalizeColorRegistry(
	registry: Record<string, string | Record<string, string>>,
): Record<string, RuntimeColorEntry> {
	const normalized: Record<string, RuntimeColorEntry> = {};

	for (const [key, value] of pairs(registry)) {
		normalized[key] = typeIs(value, "string")
			? value
			: normalizeColorScale(value);
	}

	return normalized;
}

function normalizeColorScale(scale: Record<string, string>): RuntimeColorScale {
	const normalized: RuntimeColorScale = {};

	for (const [key, entry] of pairs(scale)) {
		const value = parseColor3(entry);
		if (value !== undefined) {
			normalized[key] = value;
		}
	}

	return normalized;
}

function normalizeRadiusScale(
	scale: Record<string, string>,
): Record<string, UDim> {
	const normalized: Record<string, UDim> = {};

	for (const [key, value] of pairs(scale)) {
		normalized[key] = parseUDim(value as string) ?? new UDim(0, 0);
	}

	return normalized;
}

function normalizeSpacingScale(
	scale: Record<string, string>,
): Record<string, UDim> {
	const normalized: Record<string, UDim> = {};

	for (const [key, value] of pairs(scale)) {
		normalized[key] = parseUDim(value as string) ?? new UDim(0, 0);
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

	const segments = splitBy(token, ":");
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
	if (startsWith(token, "bg-")) {
		const key = substring(token, 3);
		const [colorName, shade] = splitColorKey(key);
		if (colorName === "transparent") {
			return {
				props: [{ name: "BackgroundTransparency", value: 1 }],
				helpers: [],
			};
		}

		const value = theme.colors[colorName];
		if (typeIs(value, "string")) {
			if (shade !== undefined) {
				return undefined;
			}

			const parsed = parseColor3(value);
			if (parsed === undefined) {
				return undefined;
			}

			return {
				props: [{ name: "BackgroundColor3", value: parsed }],
				helpers: [],
			};
		}

		if (shade === undefined || value === undefined) {
			return undefined;
		}

		const shadeValue = value[shade];
		if (shadeValue === undefined) {
			return undefined;
		}

		return {
			props: [{ name: "BackgroundColor3", value: shadeValue }],
			helpers: [],
		};
	}

	if (startsWith(token, "rounded-")) {
		const key = substring(token, stringLength("rounded-"));
		const value = resolveRadiusValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "p-")) {
		const key = substring(token, 2);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "px-")) {
		const key = substring(token, 3);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "py-")) {
		const key = substring(token, 3);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "pt-")) {
		const key = substring(token, 3);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "pr-")) {
		const key = substring(token, 3);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "pb-")) {
		const key = substring(token, 3);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "pl-")) {
		const key = substring(token, 3);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "gap-")) {
		const key = substring(token, 4);
		const value = resolveSpacingValue(theme, key);
		if (value === undefined) {
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

	if (startsWith(token, "w-")) {
		const key = substring(token, 2);
		const value = resolveSizeAxisValue(theme, key);
		if (value === undefined) {
			return undefined;
		}

		return {
			props: [{ name: "Size", value: formatSizeProp(value, undefined) }],
			helpers: [],
		};
	}

	if (startsWith(token, "h-")) {
		const key = substring(token, 2);
		const value = resolveSizeAxisValue(theme, key);
		if (value === undefined) {
			return undefined;
		}

		return {
			props: [{ name: "Size", value: formatSizeProp(undefined, value) }],
			helpers: [],
		};
	}

	if (startsWith(token, "size-")) {
		const key = substring(token, stringLength("size-"));
		const value = resolveSizeAxisValue(theme, key);
		if (value === undefined) {
			return undefined;
		}

		return {
			props: [{ name: "Size", value: formatSizeProp(value, value) }],
			helpers: [],
		};
	}

	return undefined;
}

function splitColorKey(key: string): [string, string | undefined] {
	const lastDash = lastIndexOf(key, "-");
	if (lastDash === -1) {
		return [key, undefined];
	}

	const suffix = substring(key, lastDash + 1);
	if (isColorShade(suffix)) {
		return [substring(key, 0, lastDash), suffix];
	}

	return [key, undefined];
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
): RuntimeSizeAxisValue | undefined {
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
	if (spacing !== undefined) {
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
): RuntimeSizeAxisValue | undefined {
	const numeric = parseBracketNumericValue(key);
	if (numeric === undefined) {
		return undefined;
	}

	return { scale: 0, offset: numeric };
}

function resolveNumericSpacingValue(key: string): UDim | undefined {
	if (startsWith(key, "-") || startsWith(key, "+")) {
		return undefined;
	}

	const numeric = toNumber(key);
	if (numeric === undefined || numeric < 0) {
		return undefined;
	}

	if (!isWholeNumber(numeric * 2)) {
		return undefined;
	}

	return new UDim(0, numeric * 4);
}

function resolveFractionScale(key: string): number | undefined {
	const [numeratorText, denominatorText] = splitOnce(key, "/");
	if (denominatorText === undefined) {
		return undefined;
	}

	const numerator = toNumber(numeratorText);
	const denominator = toNumber(denominatorText);
	if (numerator === undefined || denominator === undefined) {
		return undefined;
	}

	if (!isWholeNumber(numerator) || !isWholeNumber(denominator)) {
		return undefined;
	}

	const wholeNumerator = mathFloor(numerator);
	const wholeDenominator = mathFloor(denominator);
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
	width: RuntimeSizeAxisValue | undefined,
	height: RuntimeSizeAxisValue | undefined,
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
	if (!startsWith(key, "[") || !endsWith(key, "]")) {
		return undefined;
	}

	const value = substring(key, 1, -1);
	const numeric = toNumber(value);
	if (numeric === undefined || numeric < 0) {
		return undefined;
	}

	return numeric;
}

function parseColor3(value: string): Color3 | undefined {
	const args = parseCallArguments(value, "Color3.fromRGB(", ")");
	if (args === undefined || arraySize(args) !== 3) {
		return undefined;
	}

	const red = toNumber(args[0]);
	const green = toNumber(args[1]);
	const blue = toNumber(args[2]);

	if (
		red === undefined ||
		green === undefined ||
		blue === undefined ||
		![red, green, blue].every((channel) => channel >= 0 && channel <= 255)
	) {
		return undefined;
	}

	return Color3.fromRGB(red, green, blue);
}

function parseUDim(value: string): UDim | undefined {
	const args = parseCallArguments(value, "new UDim(", ")");
	if (args === undefined || arraySize(args) !== 2) {
		return undefined;
	}

	return new UDim(toNumber(args[0]) ?? 0, toNumber(args[1]) ?? 0);
}

function parseUDim2(value: string): UDim2 | undefined {
	const fromOffset = parseCallArguments(value, "UDim2.fromOffset(", ")");
	if (fromOffset !== undefined && arraySize(fromOffset) === 2) {
		return UDim2.fromOffset(
			toNumber(fromOffset[0]) ?? 0,
			toNumber(fromOffset[1]) ?? 0,
		);
	}

	const fromScale = parseCallArguments(value, "UDim2.fromScale(", ")");
	if (fromScale !== undefined && arraySize(fromScale) === 2) {
		return UDim2.fromScale(
			toNumber(fromScale[0]) ?? 0,
			toNumber(fromScale[1]) ?? 0,
		);
	}

	const constructed = parseCallArguments(value, "UDim2.new(", ")");
	if (constructed === undefined || arraySize(constructed) !== 4) {
		return undefined;
	}

	return new UDim2(
		toNumber(constructed[0]) ?? 0,
		toNumber(constructed[1]) ?? 0,
		toNumber(constructed[2]) ?? 0,
		toNumber(constructed[3]) ?? 0,
	);
}

function normalizeClassValue(value: ClassValue | undefined): string[] {
	const tokens: string[] = [];

	const visit = (entry: ClassValue | undefined): void => {
		if (entry === undefined || entry === false) {
			return;
		}

		if (typeOf(entry) === "string" || typeOf(entry) === "number") {
			for (const token of splitWhitespace(toText(entry as string | number))) {
				if (stringLength(token) > 0) {
					tokens.push(token);
				}
			}
			return;
		}

		if (typeOf(entry) === "boolean") {
			return;
		}

		if (isArrayValue(entry)) {
			for (const item of entry as ClassValue[]) {
				visit(item as ClassValue);
			}
			return;
		}

		if (typeOf(entry) === "table") {
			for (const [key, value] of pairs(entry as Record<string, unknown>)) {
				if (value === true) {
					tokens.push(key);
				}
			}
		}
	};

	visit(value);
	return tokens;
}

function normalizeChildren(children: unknown): defined[] {
	if (children === undefined || children === false) {
		return [];
	}

	if (children === true) {
		return [];
	}

	if (isArrayValue(children)) {
		const flattened: defined[] = [];
		for (const child of children as unknown[]) {
			for (const normalizedChild of normalizeChildren(child)) {
				flattened.push(normalizedChild);
			}
		}
		return flattened;
	}

	return [children as defined];
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
	const trimmed = trim(value);

	const color = parseColor3(trimmed);
	if (color !== undefined) {
		return color;
	}

	const udim = parseUDim(trimmed);
	if (udim !== undefined) {
		return udim;
	}

	const udim2 = parseUDim2(trimmed);
	if (udim2 !== undefined) {
		return udim2;
	}

	if (trimmed === "true") {
		return true;
	}

	if (trimmed === "false") {
		return false;
	}

	const numeric = toNumber(trimmed);
	if (numeric !== undefined && stringLength(trimmed) > 0) {
		return numeric;
	}

	return value;
}

function isWholeNumber(value: number): boolean {
	const rounded = mathRound(value);
	return mathAbs(value - rounded) < 1e-9;
}

declare const string: {
	len: (value: string) => number;
	sub: (value: string, start: number, stop?: number) => string;
};

const __velaStringLen = string.len;
const __velaStringSub = string.sub;

function stringLength(value: string): number {
	return __velaStringLen(value);
}

function substring(value: string, start: number, stop?: number): string {
	const resolvedStop =
		stop === undefined
			? undefined
			: stop < 0
				? stringLength(value) + stop
				: stop;

	return __velaStringSub(value, start + 1, resolvedStop);
}

function startsWith(value: string, prefix: string): boolean {
	return substring(value, 0, stringLength(prefix)) === prefix;
}

function endsWith(value: string, suffix: string): boolean {
	const suffixLength = stringLength(suffix);
	return substring(value, stringLength(value) - suffixLength) === suffix;
}

function substring(value: string, start: number, stop?: number): string {
	const resolvedStop =
		stop === undefined
			? undefined
			: stop < 0
				? stringLength(value) + stop
				: stop;

	if (string) {
		return string.sub(value, start + 1, resolvedStop);
	}

	return value;
}

function lastIndexOf(value: string, needle: string): number {
	for (
		let index = stringLength(value) - stringLength(needle);
		index >= 0;
		index--
	) {
		if (substring(value, index, index + stringLength(needle)) === needle) {
			return index;
		}
	}

	return -1;
}

function trim(value: string): string {
	let start = 0;
	let stop = stringLength(value);

	while (start < stop && isWhitespace(substring(value, start, start + 1))) {
		start++;
	}

	while (stop > start && isWhitespace(substring(value, stop - 1, stop))) {
		stop--;
	}

	return substring(value, start, stop);
}

function splitWhitespace(value: string): string[] {
	const tokens: string[] = [];
	let tokenStart: number | undefined;
	const length = stringLength(value);

	for (let index = 0; index < length; index++) {
		const character = substring(value, index, index + 1);
		if (isWhitespace(character)) {
			if (tokenStart !== undefined) {
				tokens.push(substring(value, tokenStart, index));
				tokenStart = undefined;
			}
		} else if (tokenStart === undefined) {
			tokenStart = index;
		}
	}

	if (tokenStart !== undefined) {
		tokens.push(substring(value, tokenStart));
	}

	return tokens;
}

function splitBy(value: string, separator: string): string[] {
	const pieces: string[] = [];
	let pieceStart = 0;
	const length = stringLength(value);
	const separatorLength = stringLength(separator);

	for (let index = 0; index <= length - separatorLength; index++) {
		if (substring(value, index, index + separatorLength) === separator) {
			pieces.push(substring(value, pieceStart, index));
			pieceStart = index + separatorLength;
			index = pieceStart - 1;
		}
	}

	pieces.push(substring(value, pieceStart));
	return pieces;
}

function splitOnce(
	value: string,
	separator: string,
): [string, string | undefined] {
	const separatorLength = stringLength(separator);
	for (let index = 0; index <= stringLength(value) - separatorLength; index++) {
		if (substring(value, index, index + separatorLength) === separator) {
			return [
				substring(value, 0, index),
				substring(value, index + separatorLength),
			];
		}
	}

	return [value, undefined];
}

function parseCallArguments(
	value: string,
	prefix: string,
	suffix: string,
): string[] | undefined {
	if (!startsWith(value, prefix) || !endsWith(value, suffix)) {
		return undefined;
	}

	const body = substring(value, stringLength(prefix), -stringLength(suffix));
	return splitBy(body, ",").map((entry) => trim(entry));
}

function isWhitespace(value: string): boolean {
	return value === " " || value === "\t" || value === "\n" || value === "\r";
}

function toText(value: string | number): string {
	return tostring?.(value) ?? "";
}

function toNumber(value: string): number | undefined {
	const numeric = tonumber?.(value);

	if (numeric === undefined || isNaNNumber(numeric)) {
		return undefined;
	}

	return numeric;
}

function mathAbs(value: number): number {
	return value < 0 ? -value : value;
}

function mathFloor(value: number): number {
	const remainder = value % 1;
	const truncated = value - remainder;
	return value < 0 && remainder !== 0 ? truncated - 1 : truncated;
}

function mathRound(value: number): number {
	return mathFloor(value + 0.5);
}

function isArrayValue(value: unknown): boolean {
	return typeOf(value) === "table" && arraySize(value as unknown[]) > 0;
}

function isNaNNumber(value: number): boolean {
	return !(value >= 0 || value <= 0);
}

function arraySize<T>(value: T[]): number {
	return (value as unknown as { length: number }).length;
}
"###;

pub(crate) fn create_runtime_host_module_items(config: &TailwindConfig) -> Vec<ModuleItem> {
    let config_json = serde_json::to_string(config).expect("runtime config must serialize to JSON");
    let source = format!(
		"{RUNTIME_HOST_TEMPLATE}\nconst __VelaRuntimeConfig = {config_json};\nconst VelaRuntimeHost = __createVelaRuntimeHost(__VelaRuntimeConfig);"
    );
    let items = parse_module_items(&source);

    assert!(
        !items.is_empty(),
        "inline runtime helper source must parse"
    );

    items
}
