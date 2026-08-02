use crate::config::model::TailwindConfig;
use crate::swc::parse::parse_module_items;
use swc_core::ecma::ast::ModuleItem;

const RUNTIME_HOST_TEMPLATE: &str = r###"
import __VelaReact from "@rbxts/react";
import { TweenService as __VelaTweenService, UserInputService as __VelaUserInputService, Workspace as __VelaWorkspace } from "@rbxts/services";

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
	preflight: boolean;
	theme: {
		colors: Record<string, string | Record<string, string>>;
		radius: Record<string, string>;
		spacing: Record<string, string>;
	};
};

type SupportedHostElements = {
	frame: Frame;
	scrollingframe: ScrollingFrame;
	canvasgroup: CanvasGroup;
	textlabel: TextLabel;
	textbutton: TextButton;
	textbox: TextBox;
	imagelabel: ImageLabel;
	imagebutton: ImageButton;
};

type SupportedHostElementTag = keyof SupportedHostElements;

type VelaRuntimeTag = SupportedHostElementTag | ((props: never) => unknown);

// A component element has no instance of its own for a ref to land on.
type VelaRefTarget<Tag> = Tag extends SupportedHostElementTag
	? SupportedHostElements[Tag]
	: unknown;

const PALETTE_DEFAULT_KEY = "DEFAULT";

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
	  }
	| {
			kind: "hover";
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
	hovered: boolean;
};

type RuntimeCamera = {
	ViewportSize?: {
		X: number;
		Y: number;
	};
	GetPropertyChangedSignal(property: "ViewportSize"): RBXScriptSignal;
};

type RuntimePropValue =
	| string
	| number
	| boolean
	| Color3
	| UDim
	| UDim2
	| Vector2
	| EnumItem;

type RuntimePropMap = Record<string, RuntimePropValue>;

type RuntimeHelperProp = {
	name: string;
	value: RuntimePropValue;
};

type RuntimeHelper = {
	tag: string;
	props: RuntimeHelperProp[];
};

type RuntimeTransition = {
	time: number;
	style: string;
	direction: string;
	delay: number;
};

type RuntimeTransitionState = {
	enabled?: boolean;
	time?: number;
	style?: string;
	direction?: string;
	delay?: number;
};

type RuntimeTextSpec = {
	transform?: string;
	decoration?: string;
};

type RuntimeDivide = {
	axis: string;
	thickness: number;
	color?: string;
};

type RuntimeDivideState = {
	axis?: string;
	thickness?: number;
	color?: string;
};

type RuntimeMargin = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

type RuntimeMarginState = {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
};

type RuntimeResolution = {
	props: RuntimePropMap;
	helpers: RuntimeHelper[];
	transition?: RuntimeTransitionState;
	animation?: string;
	textTransform?: string;
	textDecoration?: string;
	margin?: RuntimeMarginState;
	divide?: RuntimeDivideState;
	sizeWidth?: UDim;
	sizeHeight?: UDim;
	usesHover?: boolean;
};

type VelaRuntimeHostProps = {
	__velaTag: VelaRuntimeTag;
	__velaRules?: readonly RuntimeRule[];
	__velaTransition?: RuntimeTransition;
	__velaAnimation?: string;
	__velaText?: RuntimeTextSpec;
	__velaMargin?: RuntimeMargin;
	__velaDivide?: RuntimeDivide;
	className?: ClassValue;
	children?: defined | readonly defined[];
} & Record<string, unknown>;

// `forwardRef` fixes one ref type for the whole component, which would leave
// every consumer ref typed as `unknown`. Restating it as a generic call lets
// `ref` follow whichever host tag the transformer lowered to.
type VelaRuntimeHostComponent = <Tag extends VelaRuntimeTag>(
	props: VelaRuntimeHostProps & {
		__velaTag: Tag;
		ref?: __VelaReact.Ref<VelaRefTarget<Tag>>;
	},
) => __VelaReact.Element;

function __createVelaRuntimeHost(config: VelaRuntimeConfig) {
	const theme = normalizeTheme(config);
	const preflight = config.preflight;

	// forwardRef so slotting libraries (asChild-style cloneElement) and plain
	// consumer refs reach the rendered instance instead of dying on a function
	// component.
	return __VelaReact.forwardRef((props: VelaRuntimeHostProps, forwardedRef: unknown) => {
		const globalEnvironment = useRuntimeEnvironment();
		const [hovered, setHovered] = __VelaReact.useState(false);
		const environment: RuntimeEnvironment = {
			width: globalEnvironment.width,
			orientation: globalEnvironment.orientation,
			input: globalEnvironment.input,
			hovered,
		};
		const __velaTag = props.__velaTag;
		const __velaRules = props.__velaRules ?? [];
		const className = props.className;
		const children = props.children;

		const resolution = resolveRuntimeResolution(
			theme,
			environment,
			__velaRules as RuntimeRule[],
			className,
			preflight,
		);
		// A component tag decides its own rendering, so there is no instance to
		// tween; motion utilities only engage on real host tags.
		const instanceCapable = typeIs(__velaTag, "string");
		const resolvedTransition = resolveTransitionConfig(
			props.__velaTransition,
			resolution.transition,
		);
		const transition = instanceCapable ? resolvedTransition : undefined;
		const animation = resolution.animation ?? props.__velaAnimation;
		const animationActive =
			instanceCapable && animation !== undefined && animation !== "none";
		const margin = resolveMarginConfig(props.__velaMargin, resolution.margin);
		const divide = resolveDivideConfig(props.__velaDivide, resolution.divide);

		const instanceRef = __VelaReact.useRef<Instance | undefined>(undefined);
		const heldProps = __VelaReact.useRef<RuntimePropMap | undefined>(undefined);
		const lastGoal = __VelaReact.useRef<RuntimePropMap | undefined>(undefined);

		const hostProps: Record<string, unknown> = {};
		for (const [name, value] of pairs(props as Record<string, unknown>)) {
			if (
				name !== "__velaTag" &&
				name !== "__velaRules" &&
				name !== "__velaTransition" &&
				name !== "__velaAnimation" &&
				name !== "__velaText" &&
				name !== "__velaMargin" &&
				name !== "__velaDivide" &&
				name !== "className" &&
				name !== "children"
			) {
				hostProps[name] = value;
			}
		}
		for (const [name, value] of pairs(resolution.props)) {
			hostProps[name] = value;
		}

		applyResolvedSize(hostProps, resolution);

		if (resolution.usesHover === true) {
			attachHoverTracking(hostProps, setHovered);
		}

		applyTextConfig(hostProps, props.__velaText, resolution);

		// With a transition, React keeps rendering the first-seen value for
		// every tweenable prop so it never rewrites the instance; the effect
		// below moves the real property with TweenService instead.
		//
		// This walks the merged props rather than `resolution.props`, because a
		// base utility like `bg-slate-700` lowers statically and only ever
		// arrives as a plain prop. Seeding from the resolution alone first sees
		// the prop on the render a variant introduces it, holds that new value,
		// and leaves the tween nothing to travel from.
		const tweenGoal: RuntimePropMap = {};
		if (transition !== undefined) {
			if (heldProps.current === undefined) {
				heldProps.current = {};
			}
			const held = heldProps.current;
			for (const [name, value] of pairs(hostProps)) {
				if (!isTweenableValue(value)) {
					continue;
				}
				// Layout props move to the margin wrapper, which the inner
				// instance ref cannot tween; they apply instantly instead.
				if (margin !== undefined && isMarginWrapperProp(name as string)) {
					continue;
				}
				tweenGoal[name as string] = value;
				if (held[name as string] === undefined) {
					held[name as string] = value;
				}
				hostProps[name as string] = held[name as string];
			}
		}
		if (transition !== undefined || animationActive) {
			hostProps["ref"] = (instance: Instance | undefined) => {
				instanceRef.current = instance;
				assignForwardedRef(forwardedRef, instance);
			};
		} else if (forwardedRef !== undefined) {
			hostProps["ref"] = forwardedRef;
		}

		__VelaReact.useEffect(() => {
			const instance = instanceRef.current;
			if (instance === undefined || !animationActive) {
				return undefined;
			}
			return startPresetAnimation(instance, animation as string);
		}, [animation]);

		__VelaReact.useEffect(() => {
			if (transition === undefined) {
				lastGoal.current = undefined;
				return;
			}

			const instance = instanceRef.current;
			const previous = lastGoal.current;
			lastGoal.current = tweenGoal;
			if (instance === undefined || previous === undefined) {
				return;
			}

			const changed: Record<string, RuntimePropValue> = {};
			let hasChanged = false;
			for (const [name, value] of pairs(tweenGoal)) {
				if (previous[name as string] !== value) {
					changed[name as string] = value;
					hasChanged = true;
				}
			}
			if (!hasChanged) {
				return;
			}

			const info = new TweenInfo(
				transition.time,
				parseEasingStyle(transition.style),
				parseEasingDirection(transition.direction),
				0,
				false,
				transition.delay,
			);
			__VelaTweenService.Create(instance, info, changed as never).Play();
		});
		applyHelperDefaults(resolution.helpers);
		const runtimeChildren = resolution.helpers.map((helper) =>
			__VelaReact.createElement(helper.tag, helperToProps(helper.props)),
		);
		const allChildren: defined[] = [];
		for (const child of runtimeChildren) {
			if (child !== undefined) {
				allChildren.push(child);
			}
		}
		let userChildren = normalizeChildren(children);
		if (divide !== undefined) {
			userChildren = interleaveDivideSeparators(divide, userChildren);
		}
		for (const child of userChildren) {
			if (child !== undefined) {
				allChildren.push(child);
			}
		}

		const wrapperProps =
			margin !== undefined ? prepareMarginWrapper(margin, hostProps) : undefined;

		// React renders a component reference the same way it renders a host tag.
		const element = __VelaReact.createElement(
			__velaTag as SupportedHostElementTag,
			hostProps,
			...allChildren,
		);

		if (margin !== undefined && wrapperProps !== undefined) {
			return renderMarginWrapper(margin, wrapperProps, element) as never;
		}

		return element;
	});
}

function divideState(resolution: RuntimeResolution): RuntimeDivideState {
	let state = resolution.divide;
	if (state === undefined) {
		state = {};
		resolution.divide = state;
	}
	return state;
}

/// Consumes `divide-*` tokens from dynamic class values.
function applyDivideToken(
	theme: RuntimeTheme,
	token: string,
	resolution: RuntimeResolution,
): boolean {
	if (token === "divide-x" || token === "divide-y") {
		const state = divideState(resolution);
		state.axis = token === "divide-x" ? "x" : "y";
		if (state.thickness === undefined) {
			state.thickness = 1;
		}
		return true;
	}

	for (const prefix of ["divide-x-", "divide-y-"]) {
		if (!startsWith(token, prefix)) {
			continue;
		}
		const thickness = tonumber(substring(token, stringLength(prefix)));
		if (thickness !== undefined) {
			const state = divideState(resolution);
			state.axis = prefix === "divide-x-" ? "x" : "y";
			state.thickness = thickness;
		}
		return true;
	}

	if (startsWith(token, "divide-")) {
		const key = substring(token, stringLength("divide-"));
		const color = resolveDivideColor(theme, key);
		if (color !== undefined) {
			divideState(resolution).color = color;
		}
		return true;
	}

	return false;
}

function resolveDivideColor(theme: RuntimeTheme, key: string): string | undefined {
	const [colorName, shade] = splitColorKey(key);
	const value = theme.colors[colorName];
	if (typeIs(value, "string")) {
		return shade === undefined ? value : undefined;
	}
	if (typeIs(value, "table")) {
		const scale = value as RuntimeColorScale;
		const entry = scale[shade ?? PALETTE_DEFAULT_KEY];
		if (entry !== undefined) {
			return `Color3.fromRGB(${math.floor(entry.R * 255 + 0.5)}, ${math.floor(entry.G * 255 + 0.5)}, ${math.floor(entry.B * 255 + 0.5)})`;
		}
	}
	return undefined;
}

function resolveDivideConfig(
	base: RuntimeDivide | undefined,
	dynamic: RuntimeDivideState | undefined,
): RuntimeDivide | undefined {
	const axis = dynamic?.axis ?? base?.axis;
	if (axis === undefined) {
		return undefined;
	}

	return {
		axis,
		thickness: dynamic?.thickness ?? base?.thickness ?? 1,
		color: dynamic?.color ?? base?.color,
	};
}

/// Interleaves a separator frame between consecutive children. Separators rely
/// on hierarchy order, so lists that assign explicit LayoutOrder will scatter
/// them.
function interleaveDivideSeparators(
	divide: RuntimeDivide,
	children: defined[],
): defined[] {
	const color =
		(divide.color !== undefined ? parseColor3(divide.color) : undefined) ??
		Color3.fromRGB(229, 231, 235);
	const size =
		divide.axis === "x"
			? new UDim2(0, divide.thickness, 1, 0)
			: new UDim2(1, 0, 0, divide.thickness);

	const result: defined[] = [];
	let seenContentChild = false;
	for (const child of children) {
		if (isModifierChild(child)) {
			result.push(child);
			continue;
		}
		if (seenContentChild) {
			result.push(
				__VelaReact.createElement("frame", {
					BackgroundColor3: color,
					BorderSizePixel: 0,
					Size: size,
				} as never),
			);
		}
		seenContentChild = true;
		result.push(child);
	}
	return result;
}

/// UICorner, UIListLayout and the rest of the UI* family modify their parent
/// instead of taking a slot in it, so dividers have to step over them.
function isModifierChild(child: defined): boolean {
	const elementType = (child as { type?: unknown }).type;
	if (!typeIs(elementType, "string")) {
		return false;
	}
	return startsWith(elementType.lower(), "ui");
}

function marginState(resolution: RuntimeResolution): RuntimeMarginState {
	let state = resolution.margin;
	if (state === undefined) {
		state = {};
		resolution.margin = state;
	}
	return state;
}

/// Consumes positive `m-*` family tokens from dynamic class values. Negative
/// margins shift `Position` and are compile-time only.
function applyMarginToken(
	theme: RuntimeTheme,
	token: string,
	resolution: RuntimeResolution,
): boolean {
	const prefixes: Array<[string, Array<"top" | "right" | "bottom" | "left">]> = [
		["mx-", ["left", "right"]],
		["my-", ["top", "bottom"]],
		["mt-", ["top"]],
		["mr-", ["right"]],
		["mb-", ["bottom"]],
		["ml-", ["left"]],
		["m-", ["top", "right", "bottom", "left"]],
	];

	for (const [prefix, sides] of prefixes) {
		if (!startsWith(token, prefix)) {
			continue;
		}
		const key = substring(token, stringLength(prefix));
		if (key === "auto") {
			return true;
		}
		const value = resolveSpacingValue(theme, key);
		if (value !== undefined && value.Scale === 0) {
			const state = marginState(resolution);
			for (const side of sides) {
				state[side] = value.Offset;
			}
		}
		return true;
	}

	return false;
}

function resolveMarginConfig(
	base: RuntimeMargin | undefined,
	dynamic: RuntimeMarginState | undefined,
): RuntimeMargin | undefined {
	const margin: RuntimeMargin = {
		top: dynamic?.top ?? base?.top ?? 0,
		right: dynamic?.right ?? base?.right ?? 0,
		bottom: dynamic?.bottom ?? base?.bottom ?? 0,
		left: dynamic?.left ?? base?.left ?? 0,
	};

	if (
		margin.top === 0 &&
		margin.right === 0 &&
		margin.bottom === 0 &&
		margin.left === 0
	) {
		return undefined;
	}

	return margin;
}

const MARGIN_WRAPPER_PROPS = [
	"Size",
	"Position",
	"AnchorPoint",
	"LayoutOrder",
	"ZIndex",
	"Visible",
] as const;

function isMarginWrapperProp(name: string): boolean {
	for (const wrapperProp of MARGIN_WRAPPER_PROPS) {
		if (name === wrapperProp) {
			return true;
		}
	}
	return false;
}

/// Moves the layout props onto the CSS margin box (the wrapper) and resizes
/// the inner element to fill it. Mutates `hostProps`, so this must run before
/// the inner element is created.
function prepareMarginWrapper(
	margin: RuntimeMargin,
	hostProps: Record<string, unknown>,
): Record<string, unknown> {
	const wrapperProps: Record<string, unknown> = {
		BackgroundTransparency: 1,
		BorderSizePixel: 0,
	};

	for (const wrapperProp of MARGIN_WRAPPER_PROPS) {
		const value = hostProps[wrapperProp];
		if (value !== undefined) {
			wrapperProps[wrapperProp] = value;
			hostProps[wrapperProp] = undefined;
		}
	}

	const declaredSize = wrapperProps["Size"];
	const automaticSize = hostProps["AutomaticSize"];
	if (typeIs(declaredSize, "UDim2")) {
		wrapperProps["Size"] = new UDim2(
			declaredSize.X.Scale,
			declaredSize.X.Offset + margin.left + margin.right,
			declaredSize.Y.Scale,
			declaredSize.Y.Offset + margin.top + margin.bottom,
		);
		hostProps["Size"] = UDim2.fromScale(1, 1);
	} else if (automaticSize !== undefined) {
		// Content-sized element: the wrapper grows with it, padding included.
		wrapperProps["AutomaticSize"] = automaticSize;
	} else {
		wrapperProps["AutomaticSize"] = Enum.AutomaticSize.XY;
	}

	return wrapperProps;
}

/// Renders the margin box: a transparent wrapper padded by the margins, with
/// the real element filling the remaining space.
function renderMarginWrapper(
	margin: RuntimeMargin,
	wrapperProps: Record<string, unknown>,
	element: defined,
): defined {
	const padding = __VelaReact.createElement("uipadding", {
		PaddingTop: new UDim(0, margin.top),
		PaddingRight: new UDim(0, margin.right),
		PaddingBottom: new UDim(0, margin.bottom),
		PaddingLeft: new UDim(0, margin.left),
	} as never);

	return __VelaReact.createElement("frame", wrapperProps as never, padding, element);
}

function escapeRichText(value: string): string {
	const [amp] = value.gsub("&", "&amp;");
	const [lt] = amp.gsub("<", "&lt;");
	const [gt] = lt.gsub(">", "&gt;");
	return gt;
}

function capitalizeAsciiWords(value: string): string {
	const [result] = value.gsub("%f[%a]%a", (letter) => letter.upper());
	return result;
}

/// Transforms `Text` per the merged compile-time and dynamic config. A
/// consumer-managed `RichText` prop opts the element out of decorations, which
/// would otherwise double-escape its markup.
function applyTextConfig(
	hostProps: Record<string, unknown>,
	base: RuntimeTextSpec | undefined,
	resolution: RuntimeResolution,
) {
	const transformValue = resolution.textTransform ?? base?.transform;
	const decorationValue = resolution.textDecoration ?? base?.decoration;
	const transform = transformValue === "none" ? undefined : transformValue;
	const decoration = decorationValue === "none" ? undefined : decorationValue;
	if (transform === undefined && decoration === undefined) {
		return;
	}

	const text = hostProps["Text"];
	if (!typeIs(text, "string")) {
		return;
	}

	let result = text;
	if (transform === "upper") {
		result = result.upper();
	} else if (transform === "lower") {
		result = result.lower();
	} else if (transform === "capitalize") {
		result = capitalizeAsciiWords(result);
	}

	if (decoration !== undefined && hostProps["RichText"] === undefined) {
		hostProps["RichText"] = true;
		if (decoration === "underline") {
			result = `<u>${escapeRichText(result)}</u>`;
		} else if (decoration === "strike") {
			result = `<s>${escapeRichText(result)}</s>`;
		}
	}

	hostProps["Text"] = result;
}

function assignForwardedRef(ref: unknown, value: Instance | undefined) {
	if (typeIs(ref, "function")) {
		(ref as (instance: Instance | undefined) => void)(value);
	} else if (typeIs(ref, "table")) {
		(ref as { current?: Instance }).current = value;
	}
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
			setEnvironment((previous) => {
				const latest = readRuntimeEnvironment(camera);
				return previous.width === latest.width &&
					previous.orientation === latest.orientation &&
					previous.input === latest.input
					? previous
					: latest;
			});

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

		// ViewportSize stays 1x1 until the first frame renders, so breakpoints have
		// to follow the signal instead of the mount-time read.
		if (camera !== undefined) {
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
		hovered: false,
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
	preflight: boolean,
): RuntimeResolution {
	const resolution: RuntimeResolution = {
		props: {},
		helpers: [],
	};

	for (const rule of runtimeRules) {
		if (conditionUsesHover(rule.condition)) {
			resolution.usesHover = true;
		}
		if (matchesRuntimeCondition(rule.condition, environment)) {
			applyEffectBundle(resolution, rule.effects);
		}
	}

	for (const token of normalizeClassValue(className)) {
		applyToken(theme, environment, token, resolution, preflight);
	}

	return resolution;
}

function applyToken(
	theme: RuntimeTheme,
	environment: RuntimeEnvironment,
	token: string,
	resolution: RuntimeResolution,
	preflight: boolean,
) {
	if (!token) {
		return;
	}

	const segments = splitBy(token, ":");
	const utility = segments.pop();
	if (!utility) {
		return;
	}

	if (segments.includes("hover")) {
		resolution.usesHover = true;
	}

	if (!segments.every((segment) => matchesVariant(segment, environment))) {
		return;
	}

	if (applyDivideToken(theme, utility, resolution)) {
		return;
	}

	if (applyMarginToken(theme, utility, resolution)) {
		return;
	}

	if (utility === "uppercase") {
		resolution.textTransform = "upper";
		return;
	}
	if (utility === "lowercase") {
		resolution.textTransform = "lower";
		return;
	}
	if (utility === "capitalize") {
		resolution.textTransform = "capitalize";
		return;
	}
	if (utility === "normal-case") {
		resolution.textTransform = "none";
		return;
	}
	if (utility === "underline") {
		resolution.textDecoration = "underline";
		return;
	}
	if (utility === "line-through") {
		resolution.textDecoration = "strike";
		return;
	}
	if (utility === "no-underline") {
		resolution.textDecoration = "none";
		return;
	}

	if (startsWith(utility, "animate-")) {
		const key = substring(utility, stringLength("animate-"));
		if (
			key === "spin" ||
			key === "pulse" ||
			key === "bounce" ||
			key === "none"
		) {
			resolution.animation = key;
		}
		return;
	}

	if (applyTransitionToken(utility, resolution)) {
		return;
	}

	const effect = resolveUtilityToken(theme, utility);
	if (!effect) {
		return;
	}

	applyResolvedEffectBundle(
		resolution,
		withPreflightBackground(effect, preflight),
	);
}

/// Preflight leaves the base transparent, so a background color resolved from a
/// dynamic class value has to state its own opacity or it would never show.
function withPreflightBackground(
	effect: RuntimeResolvedEffectBundle,
	preflight: boolean,
): RuntimeResolvedEffectBundle {
	if (!preflight) {
		return effect;
	}

	let setsColor = false;
	for (const prop of effect.props) {
		if (prop.name === "BackgroundTransparency") {
			return effect;
		}
		if (prop.name === "BackgroundColor3") {
			setsColor = true;
		}
	}

	if (!setsColor) {
		return effect;
	}

	const props = [...effect.props];
	props.push({ name: "BackgroundTransparency", value: 0 });
	return { props, helpers: effect.helpers };
}

function transitionState(resolution: RuntimeResolution): RuntimeTransitionState {
	let state = resolution.transition;
	if (state === undefined) {
		state = {};
		resolution.transition = state;
	}
	return state;
}

/// Consumes `transition`/`duration-*`/`ease-*`/`delay-*` tokens from dynamic
/// class values so state-driven class changes tween instead of snapping.
function applyTransitionToken(
	token: string,
	resolution: RuntimeResolution,
): boolean {
	if (token === "transition" || startsWith(token, "transition-")) {
		const state = transitionState(resolution);
		if (token === "transition-none") {
			state.enabled = false;
		} else {
			state.enabled = true;
		}
		return true;
	}

	if (startsWith(token, "duration-")) {
		const millis = tonumber(substring(token, stringLength("duration-")));
		if (millis !== undefined) {
			const state = transitionState(resolution);
			state.time = millis / 1000;
			if (state.enabled === undefined) {
				state.enabled = true;
			}
		}
		return true;
	}

	if (startsWith(token, "delay-")) {
		const millis = tonumber(substring(token, stringLength("delay-")));
		if (millis !== undefined) {
			const state = transitionState(resolution);
			state.delay = millis / 1000;
			if (state.enabled === undefined) {
				state.enabled = true;
			}
		}
		return true;
	}

	if (startsWith(token, "ease-")) {
		const key = substring(token, stringLength("ease-"));
		const easing =
			key === "linear"
				? (["Linear", "InOut"] as const)
				: key === "in"
					? (["Quad", "In"] as const)
					: key === "out"
						? (["Quad", "Out"] as const)
						: key === "in-out"
							? (["Quad", "InOut"] as const)
							: undefined;
		if (easing !== undefined) {
			const state = transitionState(resolution);
			state.style = easing[0];
			state.direction = easing[1];
			if (state.enabled === undefined) {
				state.enabled = true;
			}
		}
		return true;
	}

	return false;
}

function resolveTransitionConfig(
	base: RuntimeTransition | undefined,
	dynamic: RuntimeTransitionState | undefined,
): RuntimeTransition | undefined {
	const enabled =
		dynamic?.enabled !== undefined ? dynamic.enabled : base !== undefined;
	if (!enabled) {
		return undefined;
	}

	return {
		time: dynamic?.time ?? base?.time ?? 0.15,
		style: dynamic?.style ?? base?.style ?? "Quad",
		direction: dynamic?.direction ?? base?.direction ?? "Out",
		delay: dynamic?.delay ?? base?.delay ?? 0,
	};
}

function isTweenableValue(value: unknown): value is RuntimePropValue {
	return (
		typeIs(value, "number") ||
		typeIs(value, "Color3") ||
		typeIs(value, "UDim") ||
		typeIs(value, "UDim2") ||
		typeIs(value, "Vector2")
	);
}

function parseEasingStyle(name: string): Enum.EasingStyle {
	const registry = Enum.EasingStyle as unknown as Record<
		string,
		Enum.EasingStyle | undefined
	>;
	return registry[name] ?? Enum.EasingStyle.Quad;
}

function parseEasingDirection(name: string): Enum.EasingDirection {
	const registry = Enum.EasingDirection as unknown as Record<
		string,
		Enum.EasingDirection | undefined
	>;
	return registry[name] ?? Enum.EasingDirection.Out;
}

/// Starts a preset loop animation and returns the cleanup that cancels it and
/// restores the animated property.
function startPresetAnimation(
	instance: Instance,
	animation: string,
): (() => void) | undefined {
	const gui = instance as GuiObject;

	if (animation === "spin") {
		const base = gui.Rotation;
		const tween = __VelaTweenService.Create(
			gui,
			new TweenInfo(1, Enum.EasingStyle.Linear, Enum.EasingDirection.InOut, -1),
			{ Rotation: base + 360 } as never,
		);
		tween.Play();
		return () => {
			tween.Cancel();
			gui.Rotation = base;
		};
	}

	if (animation === "pulse") {
		const base = gui.BackgroundTransparency;
		const tween = __VelaTweenService.Create(
			gui,
			new TweenInfo(1, Enum.EasingStyle.Quad, Enum.EasingDirection.InOut, -1, true),
			{ BackgroundTransparency: 0.5 } as never,
		);
		tween.Play();
		return () => {
			tween.Cancel();
			gui.BackgroundTransparency = base;
		};
	}

	if (animation === "bounce") {
		const base = gui.Position;
		const height = gui.AbsoluteSize.Y;
		const bounceOffset = height > 0 ? math.floor(height / 4) : 8;
		const tween = __VelaTweenService.Create(
			gui,
			new TweenInfo(0.5, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, -1, true),
			{ Position: base.sub(UDim2.fromOffset(0, bounceOffset)) } as never,
		);
		tween.Play();
		return () => {
			tween.Cancel();
			gui.Position = base;
		};
	}

	return undefined;
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
		case "hover":
			return environment.hovered;
		default:
			return false;
	}
}

function conditionUsesHover(condition: RuntimeCondition): boolean {
	if (condition.kind === "hover") {
		return true;
	}
	if (condition.kind === "all") {
		return condition.conditions.some((entry) => conditionUsesHover(entry));
	}
	return false;
}

/// Attaches MouseEnter/MouseLeave to drive the hover state, composing with any
/// handlers the consumer already declared in their Event table.
function attachHoverTracking(
	hostProps: Record<string, unknown>,
	setHovered: (hovered: boolean) => void,
) {
	const existing = hostProps["Event"];
	const events: Record<string, unknown> = {};
	if (typeIs(existing, "table")) {
		for (const [name, handler] of pairs(existing as Record<string, unknown>)) {
			events[name as string] = handler;
		}
	}

	const previousEnter = events["MouseEnter"];
	events["MouseEnter"] = (...args: unknown[]) => {
		setHovered(true);
		if (typeIs(previousEnter, "function")) {
			(previousEnter as (...args: unknown[]) => void)(...args);
		}
	};
	const previousLeave = events["MouseLeave"];
	events["MouseLeave"] = (...args: unknown[]) => {
		setHovered(false);
		if (typeIs(previousLeave, "function")) {
			(previousLeave as (...args: unknown[]) => void)(...args);
		}
	};

	hostProps["Event"] = events;
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
		case "hover":
			return environment.hovered;
		default:
			return false;
	}
}

function resolveUtilityToken(
	theme: RuntimeTheme,
	token: string,
): RuntimeResolvedEffectBundle | undefined {
	if (token === "border") {
		return {
			props: [],
			helpers: [
				{
					tag: "uistroke",
					props: [{ name: "Thickness", value: 1 }],
				},
			],
		};
	}

	if (startsWith(token, "border-")) {
		const key = substring(token, stringLength("border-"));
		if (key === "transparent") {
			return {
				props: [],
				helpers: [
					{
						tag: "uistroke",
						props: [{ name: "Transparency", value: 1 }],
					},
				],
			};
		}

		if (key === "0" || key === "1" || key === "2" || key === "4") {
			return {
				props: [],
				helpers: [
					{
						tag: "uistroke",
						props: [{ name: "Thickness", value: toNumber(key) ?? 0 }],
					},
				],
			};
		}

		if (isUnsupportedBorderKey(key)) {
			return undefined;
		}

		const [colorName, shade] = splitColorKey(key);
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
				props: [],
				helpers: [
					{
						tag: "uistroke",
						props: [
							{ name: "Color", value: parsed },
							{ name: "Transparency", value: 0 },
						],
					},
				],
			};
		}

		if (value === undefined) {
			return undefined;
		}

		const shadeValue = value[shade ?? PALETTE_DEFAULT_KEY];
		if (shadeValue === undefined) {
			return undefined;
		}

		return {
			props: [],
			helpers: [
				{
					tag: "uistroke",
					props: [
						{ name: "Color", value: shadeValue },
						{ name: "Transparency", value: 0 },
					],
				},
			],
		};
	}

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

		if (value === undefined) {
			return undefined;
		}

		const shadeValue = value[shade ?? PALETTE_DEFAULT_KEY];
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
			props: [{ name: "SizeX", value: formatSizeAxis(value) }],
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
			props: [{ name: "SizeY", value: formatSizeAxis(value) }],
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
			props: [
				{ name: "SizeX", value: formatSizeAxis(value) },
				{ name: "SizeY", value: formatSizeAxis(value) },
			],
			helpers: [],
		};
	}

	return undefined;
}

function isUnsupportedBorderKey(key: string): boolean {
	if (key === "dashed" || key === "solid" || key === "dotted" || key === "double") {
		return true;
	}

	if (key === "x" || key === "y" || key === "t" || key === "r" || key === "b" || key === "l") {
		return true;
	}

	if (
		startsWith(key, "x-") ||
		startsWith(key, "y-") ||
		startsWith(key, "t-") ||
		startsWith(key, "r-") ||
		startsWith(key, "b-") ||
		startsWith(key, "l-")
	) {
		return true;
	}

	if (startsWith(key, "opacity-")) {
		return true;
	}

	if (startsWith(key, "[") && endsWith(key, "]")) {
		return true;
	}

	if (includesChar(key, "/")) {
		return true;
	}

	const numeric = toNumber(key);
	if (numeric !== undefined) {
		return key !== "0" && key !== "1" && key !== "2" && key !== "4";
	}

	return false;
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

function formatSizeAxis(value: RuntimeSizeAxisValue): UDim {
	return new UDim(value.scale, value.offset);
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

	const constructed =
		parseCallArguments(value, "new UDim2(", ")") ??
		parseCallArguments(value, "UDim2.new(", ")");
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

function parseEnumValue(value: string): EnumItem | undefined {
	if (!startsWith(value, "Enum.")) {
		return undefined;
	}

	const segments = splitBy(value, ".");
	if (arraySize(segments) !== 3) {
		return undefined;
	}

	const registry = Enum as unknown as Record<
		string,
		Record<string, EnumItem> | undefined
	>;
	const category = registry[segments[1]];
	if (category === undefined) {
		return undefined;
	}

	return category[segments[2]];
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
		applyResolutionProp(
			resolution,
			prop.name,
			parseRuntimePropValue(prop.value),
		);
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
		applyResolutionProp(resolution, prop.name, prop.value);
	}

	for (const helper of effects.helpers) {
		setResolvedHelperProp(resolution.helpers, helper.tag, helper.props);
	}
}

/// `Size` carries two independent utility families, so a bundle that names one
/// axis travels as that axis alone and only meets the other one at the merge.
function applyResolutionProp(
	resolution: RuntimeResolution,
	name: string,
	value: RuntimePropValue,
) {
	if (name === "SizeX") {
		if (typeIs(value, "UDim")) {
			resolution.sizeWidth = value;
		}
		return;
	}

	if (name === "SizeY") {
		if (typeIs(value, "UDim")) {
			resolution.sizeHeight = value;
		}
		return;
	}

	setProp(resolution.props, name, value);
}

function applyResolvedSize(
	hostProps: Record<string, unknown>,
	resolution: RuntimeResolution,
) {
	const width = resolution.sizeWidth;
	const height = resolution.sizeHeight;
	if (width === undefined && height === undefined) {
		return;
	}

	const declared = hostProps["Size"];
	const base = typeIs(declared, "UDim2") ? declared : new UDim2(0, 0, 0, 0);
	const resolvedWidth = width ?? base.X;
	const resolvedHeight = height ?? base.Y;

	hostProps["Size"] = new UDim2(
		resolvedWidth.Scale,
		resolvedWidth.Offset,
		resolvedHeight.Scale,
		resolvedHeight.Offset,
	);
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

/// UIListLayout.SortOrder defaults to Name, which sorts children by their
/// instance name and silently ignores every `order-*`.
function applyHelperDefaults(helpers: RuntimeHelper[]) {
	for (const helper of helpers) {
		if (helper.tag !== "uilistlayout") {
			continue;
		}

		if (helper.props.find((prop) => prop.name === "SortOrder") !== undefined) {
			continue;
		}

		helper.props.push({
			name: "SortOrder",
			value: Enum.SortOrder.LayoutOrder,
		});
	}
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

	const enumValue = parseEnumValue(trimmed);
	if (enumValue !== undefined) {
		return enumValue;
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

function includesChar(value: string, char: string): boolean {
	for (let index = 0; index < stringLength(value); index++) {
		if (substring(value, index, index + 1) === char) {
			return true;
		}
	}

	return false;
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
	return value.size();
}
"###;

pub(crate) fn create_runtime_host_module_items(config: &TailwindConfig) -> Vec<ModuleItem> {
    let config_json = serde_json::to_string(config).expect("runtime config must serialize to JSON");
    let source = format!(
        "{RUNTIME_HOST_TEMPLATE}\nconst __VelaRuntimeConfig = {config_json};\nconst VelaRuntimeHost = __createVelaRuntimeHost(__VelaRuntimeConfig) as unknown as VelaRuntimeHostComponent;"
    );
    let items = parse_module_items(&source);

    assert!(!items.is_empty(), "inline runtime helper source must parse");

    items
}
