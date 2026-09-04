export type ClassDictionary = Record<string, boolean | null | undefined>;

export type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| ClassDictionary
	| ClassValue[];

export type RuntimeRemConfig = {
	base: number;
	min: number;
	max: number;
	baseResolution: {
		x: number;
		y: number;
	};
};

/// The theme tables arrive as the difference from the defaults this package
/// carries, keyed at the top level — a color family, a radius step. Most
/// projects change none of them and hand over four empty tables. A table listed
/// in `replaced` dropped entries the defaults had, so it is used as given
/// instead of merged.
export type VelaRuntimeConfig = {
	preflight: boolean;
	theme: {
		colors: Record<string, string | Record<string, string>>;
		radius: Record<string, string>;
		spacing: Record<string, string>;
		fontFamily: Record<string, string>;
		screens?: Record<string, number>;
		rem?: RuntimeRemConfig;
		replaced?: string[];
	};
	plugins?: {
		utilities?: Record<string, string | Record<string, string>>;
		variants?: Record<string, RuntimeVariantDefinition>;
	};
};

/// A variant the project registered. Both this and an inline `attr-[Name=value]`
/// resolve to the same attribute condition, so the two behave identically.
export type RuntimeVariantDefinition = {
	attribute: string;
	equals: RuntimeAttributeValue;
};

export type RuntimeAttributeValue = string | number | boolean;

export type SupportedHostElements = {
	frame: Frame;
	scrollingframe: ScrollingFrame;
	canvasgroup: CanvasGroup;
	textlabel: TextLabel;
	textbutton: TextButton;
	textbox: TextBox;
	imagelabel: ImageLabel;
	imagebutton: ImageButton;
};

export type SupportedHostElementTag = keyof SupportedHostElements;

export type VelaRuntimeTag =
	| SupportedHostElementTag
	| ((props: never) => unknown);

export type RuntimeRulePropEntry = {
	name: string;
	value: string;
};

export type RuntimeRuleHelperEntry = {
	tag: string;
	props: RuntimeRulePropEntry[];
};

export type RuntimeEffectBundle = {
	props: RuntimeRulePropEntry[];
	helpers: RuntimeRuleHelperEntry[];
};

export type RuntimeResolvedPropEntry = {
	name: string;
	value: RuntimePropValue;
};

export type RuntimeResolvedHelperEntry = {
	tag: string;
	props: RuntimeResolvedPropEntry[];
};

export type RuntimeResolvedEffectBundle = {
	props: RuntimeResolvedPropEntry[];
	helpers: RuntimeResolvedHelperEntry[];
};

export type RuntimeCondition =
	| {
			kind: "all";
			conditions: RuntimeCondition[];
	  }
	| {
			kind: "width";
			/// The breakpoint the variant was written with. Projects configure
			/// their own under `theme.screens`, so this is any name.
			alias: string;
			minWidth: number;
			/// Exclusive, so `md:` and `max-md:` partition every viewport between
			/// them instead of overlapping at the breakpoint itself.
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
			kind: "color-scheme";
			value: "light" | "dark";
	  }
	| {
			kind: "hover";
	  }
	| {
			kind: "active";
	  }
	| {
			kind: "focus";
	  }
	/// A Roblox attribute on the styled instance. The host subscribes to the
	/// attribute only where a rule reads it, and to nothing otherwise.
	| {
			kind: "attribute";
			name: string;
			value: RuntimeAttributeValue;
	  }
	/// A branch of a class value the transformer read but could not decide. The
	/// tokens were resolved there; only which of them apply is settled here.
	| {
			kind: "test";
			index: number;
			expected: boolean;
	  };

export type RuntimeRule = {
	condition: RuntimeCondition;
	effects: RuntimeEffectBundle;
};

export type RuntimeTheme = {
	colors: Record<string, RuntimeColorEntry>;
	radius: Record<string, UDim>;
	spacing: Record<string, UDim>;
	fontFamily: Record<string, string>;
	screens: Record<string, number>;
	pluginUtilities: Record<string, RuntimePluginUtility>;
	/// What `addVariant` registered, read the same way the compiler reads it so
	/// a token means one thing on both lowering paths.
	pluginVariants: Record<string, RuntimeVariantDefinition>;
};

export type RuntimePluginUtility = string | Record<string, string>;

export type RuntimeColorEntry = string | RuntimeColorScale;

export type RuntimeColorScale = Record<string, Color3>;

export type RuntimeSizeAxisValue = {
	scale: number;
	offset: number;
};

export type RuntimeEnvironment = {
	width: number;
	rem: number;
	orientation: "portrait" | "landscape";
	input: "touch" | "mouse" | "gamepad";
	colorScheme: "light" | "dark";
	hovered: boolean;
	pressed: boolean;
	focused: boolean;
	/// The attributes this element's rules read, as the styled instance last
	/// reported them. Absent where nothing reads one, which is every element
	/// that never named an attribute variant.
	attributes?: Readonly<Record<string, unknown>>;
	/// What the element's own `__velaTests` came to this render, which only the
	/// host that was handed them can answer.
	tests?: readonly boolean[];
};

export type RuntimeCamera = {
	ViewportSize?: {
		X: number;
		Y: number;
	};
	GetPropertyChangedSignal(property: "ViewportSize"): RBXScriptSignal;
};

export type RuntimePropValue =
	| string
	| number
	| boolean
	| Color3
	| ColorSequence
	| NumberSequence
	| Font
	| UDim
	| UDim2
	| Vector2
	| EnumItem;

export type RuntimePropMap = Record<string, RuntimePropValue>;

export type RuntimeHelperProp = {
	name: string;
	value: RuntimePropValue;
};

export type VariantEventBinding = {
	name: string;
	handler: (...args: unknown[]) => void;
};

export type RuntimeHelper = {
	tag: string;
	props: RuntimeHelperProp[];
};

export type RuntimeTransition = {
	time: number;
	style: string;
	direction: string;
	delay: number;
	property: string;
};

export type RuntimeTransitionState = {
	enabled?: boolean;
	time?: number;
	style?: string;
	direction?: string;
	delay?: number;
	property?: string;
};

/** What a transition asks the motion driver to move the instance through. */
export type VelaMotionSpec = RuntimeTransition;

/**
 * What the tweening properties belong to. `helper` names the UI* child a
 * property lives on (`"uicorner"`, `"uistroke"`, `"uishadow"`, `"uiscale"`),
 * and is absent when the target is the styled GuiObject itself. `owner` is
 * always that GuiObject, so a driver can key its state off the element even
 * while it moves a helper.
 */
export type VelaMotionTarget = {
	owner: Instance;
	helper?: string;
};

/**
 * The seam `plugins.motion` replaces. A driver takes over the method it
 * implements and leaves the rest to the built-in TweenService one, so a driver
 * that only springs transitions keeps the stock `animate-*` presets.
 *
 * `transition` receives only the properties that changed, and owns writing
 * them: with a transition in play the element holds its rendered value, so a
 * driver that never assigns leaves the instance where it was.
 * `animate` returns its own cleanup, called when the animation is taken away.
 */
/// Method signatures, not function properties: roblox-ts gives an object
/// literal's method an implicit `self`, so a driver written the documented way
/// only lines up when the runtime calls it as a method too. Stated as
/// properties instead, roblox-ts accepts the same driver and then shifts every
/// argument by one at the call.
export type VelaMotionDriver = {
	transition?(
		instance: Instance,
		goal: Record<string, RuntimePropValue>,
		spec: VelaMotionSpec,
		/// Added in 0.13, and optional so a driver written against the older
		/// three-argument shape keeps working. It says what `instance` is: the
		/// styled GuiObject, or one of the UI* helpers vela renders under it.
		target?: VelaMotionTarget,
	): void;
	animate?(instance: Instance, animation: string): (() => void) | undefined;
};

export type RuntimeTextSpec = {
	transform?: string;
	decoration?: string;
};

export type RuntimeDivide = {
	axis: string;
	thickness: number;
	color?: string;
	transparency?: number;
};

export type RuntimeDivideState = {
	axis?: string;
	thickness?: number;
	color?: string;
	transparency?: number;
};

export type RuntimeMargin = {
	top: number;
	right: number;
	bottom: number;
	left: number;
};

export type RuntimeMarginState = {
	top?: number;
	right?: number;
	bottom?: number;
	left?: number;
};

export type RuntimeResolution = {
	props: RuntimePropMap;
	helpers: RuntimeHelper[];
	/// What an `opacity-*` resolved to on a component element, where there is no
	/// tag to name a transparency channel against.
	opacityAlpha?: number;
	transition?: RuntimeTransitionState;
	animation?: string;
	textTransform?: string;
	textDecoration?: string;
	margin?: RuntimeMarginState;
	divide?: RuntimeDivideState;
	sizeWidth?: UDim;
	sizeHeight?: UDim;
	autoWidth?: boolean;
	autoHeight?: boolean;
	positionX?: UDim;
	positionY?: UDim;
	translateX?: UDim;
	translateY?: UDim;
	centerX?: boolean;
	centerY?: boolean;
	marginShiftX?: number;
	marginShiftY?: number;
	minWidth?: number;
	minHeight?: number;
	maxWidth?: number;
	maxHeight?: number;
	fontFamily?: string;
	fontWeight?: Enum.FontWeight;
	fontStyle?: Enum.FontStyle;
	gapOffset?: number;
	gridCells?: number;
	gridCellsHorizontal?: boolean;
	gridCrossExtent?: number;
	gradientRotation?: number;
	gradientFrom?: Color3;
	gradientVia?: Color3;
	gradientTo?: Color3;
	gradientFromTransparency?: number;
	gradientViaTransparency?: number;
	gradientToTransparency?: number;
	usesHover?: boolean;
	usesActive?: boolean;
	usesFocus?: boolean;
	/// What a pixel offset resolved at runtime multiplies by, applied as each
	/// value lands rather than at the end so composition never sees a raw offset.
	remRatio?: number;
};
