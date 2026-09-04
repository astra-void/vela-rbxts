import { __VelaColor } from "./color";
import { __VelaDefaults } from "./defaults";
import { __VelaLua } from "./lua";
import { __VelaOpacity } from "./opacity";
import type {
	RuntimePropValue,
	RuntimeResolvedEffectBundle,
	RuntimeResolvedPropEntry,
	RuntimeTheme,
} from "./types";
import { __VelaValue } from "./value";

export namespace __VelaToken {
	/// `fit` and `auto` do not produce a size; they hand the axis to Roblox.
	function isAutomaticSizeKey(key: string): boolean {
		return key === "fit" || key === "auto";
	}

	/// Mirrors TEXT_SIZE_VALUES on the static path. `text-[15px]` is a size too;
	/// only a number reads that way, so `text-[#f00]` stays a color.
	function resolveTextSizeValue(key: string): number | undefined {
		const arbitrary = __VelaValue.parseArbitraryLength(key);
		if (arbitrary !== undefined) return arbitrary;
		if (key === "xs") return 12;
		if (key === "sm") return 14;
		if (key === "base") return 16;
		if (key === "lg") return 18;
		if (key === "xl") return 20;
		if (key === "2xl") return 24;
		if (key === "3xl") return 30;
		if (key === "4xl") return 36;
		if (key === "5xl") return 48;
		if (key === "6xl") return 60;
		if (key === "7xl") return 72;
		if (key === "8xl") return 96;
		if (key === "9xl") return 128;
		return undefined;
	}

	/// `text-left|center|right` on the static path; `justify` has no Roblox
	/// equivalent and is left unresolved there too.
	function resolveTextXAlignmentValue(
		key: string,
	): Enum.TextXAlignment | undefined {
		if (key === "left") return Enum.TextXAlignment.Left;
		if (key === "center") return Enum.TextXAlignment.Center;
		if (key === "right") return Enum.TextXAlignment.Right;
		return undefined;
	}

	/// Mirrors FONT_WEIGHT_VALUES. A payload that is not a weight is read as a
	/// `theme.fontFamily` key, the way Tailwind overloads `font-*`.
	function resolveFontWeightValue(key: string): Enum.FontWeight | undefined {
		if (key === "thin") return Enum.FontWeight.Thin;
		if (key === "extralight") return Enum.FontWeight.ExtraLight;
		if (key === "light") return Enum.FontWeight.Light;
		if (key === "normal") return Enum.FontWeight.Regular;
		if (key === "medium") return Enum.FontWeight.Medium;
		if (key === "semibold") return Enum.FontWeight.SemiBold;
		if (key === "bold") return Enum.FontWeight.Bold;
		if (key === "extrabold") return Enum.FontWeight.ExtraBold;
		if (key === "black") return Enum.FontWeight.Heavy;
		return undefined;
	}

	export function propEffect(
		name: string,
		value: RuntimePropValue,
	): RuntimeResolvedEffectBundle {
		return { props: [{ name, value }], helpers: [] };
	}

	function propsEffect(
		props: RuntimeResolvedPropEntry[],
	): RuntimeResolvedEffectBundle {
		return { props, helpers: [] };
	}

	function helperEffect(
		tag: string,
		props: RuntimeResolvedPropEntry[],
	): RuntimeResolvedEffectBundle {
		return { props: [], helpers: [{ tag, props }] };
	}

	const ALL_RADIUS_PROPS = ["CornerRadius"];

	function radiusEffect(
		value: UDim,
		props: string[],
	): RuntimeResolvedEffectBundle {
		return helperEffect(
			"uicorner",
			props.map((name) => ({ name, value })),
		);
	}

	/// Spelled out rather than built from the direction, so the guard that reads
	/// this file for every static utility prefix can find each one.
	const DIRECTIONAL_RADIUS_PREFIXES: Array<[string, string[]]> = [
		["rounded-tl-", ["TopLeftRadius"]],
		["rounded-tr-", ["TopRightRadius"]],
		["rounded-bl-", ["BottomLeftRadius"]],
		["rounded-br-", ["BottomRightRadius"]],
		["rounded-t-", ["TopLeftRadius", "TopRightRadius"]],
		["rounded-r-", ["TopRightRadius", "BottomRightRadius"]],
		["rounded-b-", ["BottomLeftRadius", "BottomRightRadius"]],
		["rounded-l-", ["TopLeftRadius", "BottomLeftRadius"]],
	];

	function resolveRadiusPayload(token: string): [string, string[]] {
		for (const [prefix, props] of DIRECTIONAL_RADIUS_PREFIXES) {
			if (__VelaLua.startsWith(token, prefix)) {
				return [__VelaLua.after(token, prefix), props];
			}

			// `rounded-t` is the prefix without its key: the directional DEFAULT.
			if (token === __VelaLua.substring(prefix, 0, -1)) {
				return [__VelaDefaults.PALETTE_DEFAULT_KEY, props];
			}
		}

		return [__VelaLua.after(token, "rounded-"), ALL_RADIUS_PROPS];
	}

	/// A gradient stop carries its `/N` alpha beside the color, because
	/// UIGradient only learns the keypoint positions once every stop is known.
	function gradientStopEffect(
		theme: RuntimeTheme,
		name: string,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		const stop = __VelaColor.resolveGradientStop(theme, key);
		if (stop === undefined) {
			return undefined;
		}

		const [color, transparency] = stop;
		const props: RuntimeResolvedPropEntry[] = [{ name, value: color }];
		if (transparency !== undefined) {
			props.push({ name: `${name}Transparency`, value: transparency });
		}

		return propsEffect(props);
	}

	export function colorPropEffect(
		theme: RuntimeTheme,
		key: string,
		colorProp: string,
		transparencyProp: string | undefined,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = __VelaColor.splitColorOpacity(key);
		const resolved = __VelaColor.resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return transparencyProp === undefined
				? undefined
				: propEffect(transparencyProp, 1);
		}

		const props: RuntimeResolvedPropEntry[] = [
			{ name: colorProp, value: resolved.color },
		];
		if (transparencyProp !== undefined && opacity !== undefined) {
			props.push({
				name: transparencyProp,
				value: __VelaValue.opacityToTransparency(opacity),
			});
		}

		return propsEffect(props);
	}

	function resolveNegativeRotationToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveRotationValue(
			__VelaLua.after(token, "-rotate-"),
			true,
		);
		return value === undefined ? undefined : propEffect("Rotation", value);
	}

	function resolveNegativePositionToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const [prefix, positive] of [
			["-top-", "top-"],
			["-left-", "left-"],
			["-right-", "right-"],
			["-bottom-", "bottom-"],
			["-inset-", "inset-"],
			["-order-", "order-"],
			["-translate-x-", "translate-x-"],
			["-translate-y-", "translate-y-"],
		] as Array<[string, string]>) {
			if (__VelaLua.startsWith(token, prefix)) {
				return resolvePositionalToken(
					theme,
					positive,
					__VelaLua.after(token, prefix),
					true,
				);
			}
		}

		return undefined;
	}

	function resolveScrollbarThicknessToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const offset = __VelaValue.resolveSpacingOffset(
			theme,
			__VelaLua.after(token, "scrollbar-w-"),
		);
		return offset === undefined
			? undefined
			: propEffect("ScrollBarThickness", offset);
	}

	function resolveDefaultRadiusToken(
		theme: RuntimeTheme,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveRadiusValue(
			theme,
			__VelaDefaults.PALETTE_DEFAULT_KEY,
		);
		return value === undefined
			? undefined
			: radiusEffect(value, ALL_RADIUS_PROPS);
	}

	function resolveTextToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "text-");
		const textSize = resolveTextSizeValue(key);
		if (textSize !== undefined) {
			return propEffect("TextSize", textSize);
		}

		const alignment = resolveTextXAlignmentValue(key);
		if (alignment !== undefined) {
			return propEffect("TextXAlignment", alignment);
		}

		const wrap = __VelaValue.resolveTextWrapValue(key);
		if (wrap !== undefined) {
			return propEffect("TextWrapped", wrap);
		}

		return colorPropEffect(theme, key, "TextColor3", "TextTransparency");
	}

	function resolveShadowToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "shadow-");
		if (key === "none") {
			return helperEffect("uishadow", [{ name: "Enabled", value: false }]);
		}

		// An inset shadow has no UIStroke-style equivalent to render into.
		if (key === "inner") {
			return undefined;
		}

		const preset = resolveShadowPreset(key);
		if (preset !== undefined) {
			return preset;
		}

		return shadowColorEffect(theme, key);
	}

	function resolveFontToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "font-");
		const weight = resolveFontWeightValue(key);
		if (weight !== undefined) {
			return propEffect("FontWeight", weight);
		}

		const family = theme.fontFamily[key];
		return family === undefined ? undefined : propEffect("FontFamily", family);
	}

	function resolveBackgroundColorToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return colorPropEffect(
			theme,
			__VelaLua.after(token, "bg-"),
			"BackgroundColor3",
			"BackgroundTransparency",
		);
	}

	function resolveTextYAlignmentToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const alignment = __VelaValue.resolveTextYAlignmentValue(
			__VelaLua.after(token, "align-"),
		);
		return alignment === undefined
			? undefined
			: propEffect("TextYAlignment", alignment);
	}

	function resolveImageColorToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return colorPropEffect(
			theme,
			__VelaLua.after(token, "image-"),
			"ImageColor3",
			"ImageTransparency",
		);
	}

	function resolvePlaceholderColorToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return colorPropEffect(
			theme,
			__VelaLua.after(token, "placeholder-"),
			"PlaceholderColor3",
			undefined,
		);
	}

	function resolveBorderColorToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return resolveBorderToken(theme, __VelaLua.after(token, "border-"));
	}

	function resolveRadiusToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const [key, props] = resolveRadiusPayload(token);
		const value = __VelaValue.resolveRadiusValue(theme, key);
		return value === undefined ? undefined : radiusEffect(value, props);
	}

	function resolveZIndexToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveZIndexValue(__VelaLua.after(token, "z-"));
		return value === undefined ? undefined : propEffect("ZIndex", value);
	}

	function resolvePaddingToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const [prefix, sides] of [
			["p-", ["PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft"]],
			["px-", ["PaddingLeft", "PaddingRight"]],
			["py-", ["PaddingTop", "PaddingBottom"]],
			["pt-", ["PaddingTop"]],
			["pr-", ["PaddingRight"]],
			["pb-", ["PaddingBottom"]],
			["pl-", ["PaddingLeft"]],
		] as Array<[string, string[]]>) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const value = __VelaValue.resolveSpacingValue(
				theme,
				__VelaLua.after(token, prefix),
			);
			return value === undefined
				? undefined
				: helperEffect(
						"uipadding",
						sides.map((name) => ({ name, value })),
					);
		}

		return undefined;
	}

	function resolveGapToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveSpacingValue(
			theme,
			__VelaLua.after(token, "gap-"),
		);
		if (value === undefined) {
			return undefined;
		}

		// The offset travels alongside so a grid can subtract each cell's share
		// of the gap from its track, exactly as the static path does.
		return {
			props:
				value.Scale === 0 ? [{ name: "GapOffset", value: value.Offset }] : [],
			helpers: [{ tag: "uilistlayout", props: [{ name: "Padding", value }] }],
		};
	}

	function resolveSizeConstraintToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const [prefix, name] of [
			["min-w-", "MinWidth"],
			["max-w-", "MaxWidth"],
			["min-h-", "MinHeight"],
			["max-h-", "MaxHeight"],
		] as Array<[string, string]>) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const offset = __VelaValue.resolveSpacingOffset(
				theme,
				__VelaLua.after(token, prefix),
			);
			return offset === undefined ? undefined : propEffect(name, offset);
		}

		return undefined;
	}

	function resolveWidthToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "w-");
		if (isAutomaticSizeKey(key)) {
			return propEffect("AutoX", true);
		}

		const value = __VelaValue.resolveSizeAxisValue(theme, key);
		return value === undefined
			? undefined
			: propEffect("SizeX", __VelaValue.formatSizeAxis(value));
	}

	function resolveHeightToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "h-");
		if (isAutomaticSizeKey(key)) {
			return propEffect("AutoY", true);
		}

		const value = __VelaValue.resolveSizeAxisValue(theme, key);
		return value === undefined
			? undefined
			: propEffect("SizeY", __VelaValue.formatSizeAxis(value));
	}

	function resolveSquareSizeToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "size-");
		if (isAutomaticSizeKey(key)) {
			return propsEffect([
				{ name: "AutoX", value: true },
				{ name: "AutoY", value: true },
			]);
		}

		const value = __VelaValue.resolveSizeAxisValue(theme, key);
		return value === undefined
			? undefined
			: propsEffect([
					{ name: "SizeX", value: __VelaValue.formatSizeAxis(value) },
					{ name: "SizeY", value: __VelaValue.formatSizeAxis(value) },
				]);
	}

	function resolveOverflowToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveOverflowValue(
			__VelaLua.after(token, "overflow-"),
		);
		return value === undefined
			? undefined
			: propEffect("ClipsDescendants", value);
	}

	function resolveRotationToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveRotationValue(
			__VelaLua.after(token, "rotate-"),
			false,
		);
		return value === undefined ? undefined : propEffect("Rotation", value);
	}

	function resolveScaleToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveScaleValue(
			__VelaLua.after(token, "scale-"),
		);
		return value === undefined
			? undefined
			: helperEffect("uiscale", [{ name: "Scale", value }]);
	}

	function resolveOpacityToken(
		token: string,
		tag: string | undefined,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveOpacityValue(
			__VelaLua.after(token, "opacity-"),
		);
		if (value === undefined) {
			return undefined;
		}

		// A CanvasGroup composites its whole subtree, so `GroupTransparency` is
		// the only property that means what CSS `opacity` means.
		if (tag === "canvasgroup") {
			return propEffect("GroupTransparency", value);
		}

		// A component element hides which instance it will render, so there is
		// no channel to name here. The alpha travels to whatever it renders
		// instead, and lowers there against a tag that is known.
		if (tag === undefined) {
			return propEffect("OpacityAlpha", 1 - value);
		}

		// The channels fade the instance; the alpha travels on to the subtree,
		// which the transformer left alone because this class list was not
		// knowable until now.
		const props: RuntimeResolvedPropEntry[] = __VelaOpacity
			.transparencyProps(tag)
			.map((name) => ({ name, value }));
		props.push({ name: "OpacityAlpha", value: 1 - value });

		return propsEffect(props);
	}

	function resolveAspectRatioToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveAspectRatioValue(
			__VelaLua.after(token, "aspect-"),
		);
		return value === undefined
			? undefined
			: helperEffect("uiaspectratioconstraint", [
					{ name: "AspectRatio", value },
				]);
	}

	function resolveFlexToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "flex-");
		if (key !== "row" && key !== "col") {
			return undefined;
		}

		return listLayoutEffect(
			"FillDirection",
			key === "row"
				? Enum.FillDirection.Horizontal
				: Enum.FillDirection.Vertical,
		);
	}

	function resolveJustifyToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const prop = __VelaValue.resolveJustifyProp(
			__VelaLua.after(token, "justify-"),
		);
		return prop === undefined
			? undefined
			: helperEffect("uilistlayout", [prop]);
	}

	function resolveAlignItemsToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const prop = __VelaValue.resolveAlignItemsProp(
			__VelaLua.after(token, "items-"),
		);
		return prop === undefined
			? undefined
			: helperEffect("uilistlayout", [prop]);
	}

	function resolveGradientStopToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const [prefix, name] of [
			["from-", "GradientFrom"],
			["via-", "GradientVia"],
		] as Array<[string, string]>) {
			if (__VelaLua.startsWith(token, prefix)) {
				return gradientStopEffect(theme, name, __VelaLua.after(token, prefix));
			}
		}

		return undefined;
	}

	function resolveTopToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return resolvePositionalToken(
			theme,
			"top-",
			__VelaLua.after(token, "top-"),
			false,
		);
	}

	function resolveGradientEndToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return gradientStopEffect(
			theme,
			"GradientTo",
			__VelaLua.after(token, "to-"),
		);
	}

	function resolvePositionalFamilyToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const prefix of [
			"left-",
			"right-",
			"bottom-",
			"inset-",
			"order-",
			"translate-x-",
			"translate-y-",
			"basis-",
		]) {
			if (__VelaLua.startsWith(token, prefix)) {
				return resolvePositionalToken(
					theme,
					prefix,
					__VelaLua.after(token, prefix),
					false,
				);
			}
		}

		return undefined;
	}

	function resolveAnchorOriginToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveAnchorPointValue(
			__VelaLua.after(token, "origin-"),
		);
		return value === undefined ? undefined : propEffect("AnchorPoint", value);
	}

	function resolveAlignContentToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const prop = __VelaValue.resolveAlignContentProp(
			__VelaLua.after(token, "content-"),
		);
		return prop === undefined
			? undefined
			: helperEffect("uilistlayout", [prop]);
	}

	function resolveAlignSelfToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveAlignSelfValue(
			__VelaLua.after(token, "self-"),
		);
		return value === undefined
			? undefined
			: helperEffect("uiflexitem", [{ name: "ItemLineAlignment", value }]);
	}

	function resolveLineHeightToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveLineHeightValue(
			__VelaLua.after(token, "leading-"),
		);
		return value === undefined ? undefined : propEffect("LineHeight", value);
	}

	function resolveGridTrackToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const prefix of ["grid-cols-", "grid-rows-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const count = __VelaValue.resolveGridCellCount(
				__VelaLua.after(token, prefix),
			);
			if (count === undefined) {
				return undefined;
			}

			const horizontal = prefix === "grid-cols-";
			return {
				props: [
					{ name: "GridCells", value: count },
					{ name: "GridCellsHorizontal", value: horizontal },
				],
				helpers: [
					{
						tag: "uigridlayout",
						props: [
							{ name: "SortOrder", value: Enum.SortOrder.LayoutOrder },
							{
								name: "FillDirection",
								value: horizontal
									? Enum.FillDirection.Horizontal
									: Enum.FillDirection.Vertical,
							},
							{ name: "FillDirectionMaxCells", value: count },
						],
					},
				],
			};
		}

		return undefined;
	}

	function resolveGridAutoToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const prefix of ["auto-rows-", "auto-cols-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const extent = __VelaValue.resolveSpacingOffset(
				theme,
				__VelaLua.after(token, prefix),
			);
			if (extent === undefined) {
				return undefined;
			}

			return {
				props: [{ name: "GridCrossExtent", value: extent }],
				helpers: [
					{
						tag: "uigridlayout",
						props: [{ name: "SortOrder", value: Enum.SortOrder.LayoutOrder }],
					},
				],
			};
		}

		return undefined;
	}

	function resolveObjectFitToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveObjectFitValue(
			__VelaLua.after(token, "object-"),
		);
		return value === undefined ? undefined : propEffect("ScaleType", value);
	}

	function resolvePointerEventsToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolvePointerEventsValue(
			__VelaLua.after(token, "pointer-events-"),
		);
		return value === undefined ? undefined : propEffect("Interactable", value);
	}

	function resolveSpaceToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const prefix of ["space-x-", "space-y-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const value = __VelaValue.resolveSpacingValue(
				theme,
				__VelaLua.after(token, prefix),
			);
			return value === undefined
				? undefined
				: helperEffect("uilistlayout", [
						{ name: "Padding", value },
						{
							name: "FillDirection",
							value:
								prefix === "space-x-"
									? Enum.FillDirection.Horizontal
									: Enum.FillDirection.Vertical,
						},
					]);
		}

		return undefined;
	}

	function resolveWhitespaceToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveWhitespaceValue(
			__VelaLua.after(token, "whitespace-"),
		);
		return value === undefined ? undefined : propEffect("TextWrapped", value);
	}

	function resolveOverscrollToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveOverscrollValue(
			__VelaLua.after(token, "overscroll-"),
		);
		return value === undefined
			? undefined
			: propEffect("ElasticBehavior", value);
	}

	function resolveScrollbarColorToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		return colorPropEffect(
			theme,
			__VelaLua.after(token, "scrollbar-"),
			"ScrollBarImageColor3",
			"ScrollBarImageTransparency",
		);
	}

	function resolveScrollToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const key = __VelaLua.after(token, "scroll-");
		if (key === "none") {
			return propEffect("ScrollingEnabled", false);
		}

		const value = __VelaValue.resolveScrollDirectionValue(key);
		return value === undefined
			? undefined
			: propEffect("ScrollingDirection", value);
	}

	function resolveCanvasToken(
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		const value = __VelaValue.resolveCanvasSizeValue(
			__VelaLua.after(token, "canvas-"),
		);
		return value === undefined
			? undefined
			: propEffect("AutomaticCanvasSize", value);
	}

	function resolveStrokeFamilyToken(
		theme: RuntimeTheme,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		for (const prefix of ["ring-", "outline-"]) {
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const key = __VelaLua.after(token, prefix);
			const thickness = resolveStrokeThickness(prefix === "outline-", key);
			if (thickness !== undefined) {
				return strokeThicknessEffect(thickness);
			}

			if (isUnsupportedStrokeKey(key)) {
				return undefined;
			}

			return strokeColorEffect(theme, key);
		}

		return undefined;
	}

	export function resolveUtilityToken(
		theme: RuntimeTheme,
		tag: string | undefined,
		token: string,
	): RuntimeResolvedEffectBundle | undefined {
		// Negative families are their own tokens rather than a payload, so they are
		// matched before the positive prefixes would swallow them.
		if (__VelaLua.startsWith(token, "-rotate-")) {
			return resolveNegativeRotationToken(token);
		}

		// `-z-*` has no Roblox meaning: ZIndex is unsigned in the layers vela emits.
		if (__VelaLua.startsWith(token, "-z-")) {
			return undefined;
		}

		const negativePosition = resolveNegativePositionToken(theme, token);
		if (negativePosition !== undefined) {
			return negativePosition;
		}

		if (token === "border") {
			return helperEffect("uistroke", [{ name: "Thickness", value: 1 }]);
		}

		if (token === "grid") {
			return helperEffect("uigridlayout", [
				{ name: "SortOrder", value: Enum.SortOrder.LayoutOrder },
			]);
		}

		// `scrollbar-none` hides the bar by zeroing its thickness, so it belongs to
		// the thickness family rather than the color one it looks like.
		if (token === "scrollbar-none") {
			return propEffect("ScrollBarThickness", 0);
		}

		if (__VelaLua.startsWith(token, "scrollbar-w-")) {
			return resolveScrollbarThicknessToken(theme, token);
		}

		if (token === "ring" || token === "outline") {
			return strokeThicknessEffect(token === "ring" ? 3 : 2);
		}

		if (token === "rounded") {
			return resolveDefaultRadiusToken(theme);
		}

		if (token === "truncate") {
			return propEffect("TextTruncate", Enum.TextTruncate.AtEnd);
		}

		if (token === "italic") {
			return propEffect("FontStyle", Enum.FontStyle.Italic);
		}

		if (token === "not-italic") {
			return propEffect("FontStyle", Enum.FontStyle.Normal);
		}

		// `text-*` is an overloaded prefix: sizes, alignment, wrapping and colors all
		// share it, and the static path classifies them in this order.
		if (__VelaLua.startsWith(token, "text-")) {
			return resolveTextToken(theme, token);
		}

		for (const prefix of ["bg-gradient-to-", "bg-linear-to-"]) {
			if (__VelaLua.startsWith(token, prefix)) {
				const rotation = __VelaValue.resolveGradientRotation(
					__VelaLua.after(token, prefix),
				);
				return rotation === undefined
					? undefined
					: propEffect("GradientRotation", rotation);
			}
		}

		if (token === "shadow") {
			return shadowPresetEffect(3, 1, 0, 0.9);
		}

		if (__VelaLua.startsWith(token, "shadow-")) {
			return resolveShadowToken(theme, token);
		}

		if (token === "flex" || token === "flex-row") {
			return listLayoutEffect("FillDirection", Enum.FillDirection.Horizontal);
		}

		if (token === "flex-col") {
			return listLayoutEffect("FillDirection", Enum.FillDirection.Vertical);
		}

		if (token === "flex-wrap" || token === "flex-nowrap") {
			return listLayoutEffect("Wraps", token === "flex-wrap");
		}

		const flexItem = __VelaValue.resolveFlexItemMode(token);
		if (flexItem !== undefined) {
			return helperEffect("uiflexitem", [
				{ name: "FlexMode", value: flexItem },
			]);
		}

		if (token === "hidden" || token === "visible") {
			return propEffect("Visible", token === "visible");
		}

		// `font-*` carries both the weight scale and the theme's font families; the
		// fixed weight names win and anything else is read as a theme key.
		if (__VelaLua.startsWith(token, "font-")) {
			return resolveFontToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "bg-")) {
			return resolveBackgroundColorToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "align-")) {
			return resolveTextYAlignmentToken(token);
		}

		if (__VelaLua.startsWith(token, "image-")) {
			return resolveImageColorToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "placeholder-")) {
			return resolvePlaceholderColorToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "border-")) {
			return resolveBorderColorToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "rounded-")) {
			return resolveRadiusToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "z-")) {
			return resolveZIndexToken(token);
		}

		const padding = resolvePaddingToken(theme, token);
		if (padding !== undefined) {
			return padding;
		}

		if (__VelaLua.startsWith(token, "gap-")) {
			return resolveGapToken(theme, token);
		}

		const sizeConstraint = resolveSizeConstraintToken(theme, token);
		if (sizeConstraint !== undefined) {
			return sizeConstraint;
		}

		if (__VelaLua.startsWith(token, "w-")) {
			return resolveWidthToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "h-")) {
			return resolveHeightToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "size-")) {
			return resolveSquareSizeToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "overflow-")) {
			return resolveOverflowToken(token);
		}

		if (__VelaLua.startsWith(token, "rotate-")) {
			return resolveRotationToken(token);
		}

		if (__VelaLua.startsWith(token, "scale-")) {
			return resolveScaleToken(token);
		}

		if (__VelaLua.startsWith(token, "opacity-")) {
			return resolveOpacityToken(token, tag);
		}

		if (__VelaLua.startsWith(token, "aspect-")) {
			return resolveAspectRatioToken(token);
		}

		if (__VelaLua.startsWith(token, "flex-")) {
			return resolveFlexToken(token);
		}

		if (__VelaLua.startsWith(token, "justify-")) {
			return resolveJustifyToken(token);
		}

		if (__VelaLua.startsWith(token, "items-")) {
			return resolveAlignItemsToken(token);
		}

		const gradientStop = resolveGradientStopToken(theme, token);
		if (gradientStop !== undefined) {
			return gradientStop;
		}

		// `top-` must come before `to-`, which would otherwise swallow it.
		if (__VelaLua.startsWith(token, "top-")) {
			return resolveTopToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "to-")) {
			return resolveGradientEndToken(theme, token);
		}

		const positionalFamily = resolvePositionalFamilyToken(theme, token);
		if (positionalFamily !== undefined) {
			return positionalFamily;
		}

		if (__VelaLua.startsWith(token, "origin-")) {
			return resolveAnchorOriginToken(token);
		}

		if (__VelaLua.startsWith(token, "content-")) {
			return resolveAlignContentToken(token);
		}

		if (__VelaLua.startsWith(token, "self-")) {
			return resolveAlignSelfToken(token);
		}

		if (__VelaLua.startsWith(token, "leading-")) {
			return resolveLineHeightToken(token);
		}

		const gridTrack = resolveGridTrackToken(token);
		if (gridTrack !== undefined) {
			return gridTrack;
		}

		const gridAuto = resolveGridAutoToken(theme, token);
		if (gridAuto !== undefined) {
			return gridAuto;
		}

		if (__VelaLua.startsWith(token, "object-")) {
			return resolveObjectFitToken(token);
		}

		if (__VelaLua.startsWith(token, "pointer-events-")) {
			return resolvePointerEventsToken(token);
		}

		const space = resolveSpaceToken(theme, token);
		if (space !== undefined) {
			return space;
		}

		if (__VelaLua.startsWith(token, "whitespace-")) {
			return resolveWhitespaceToken(token);
		}

		if (__VelaLua.startsWith(token, "overscroll-")) {
			return resolveOverscrollToken(token);
		}

		if (__VelaLua.startsWith(token, "scrollbar-")) {
			return resolveScrollbarColorToken(theme, token);
		}

		if (__VelaLua.startsWith(token, "scroll-")) {
			return resolveScrollToken(token);
		}

		if (__VelaLua.startsWith(token, "canvas-")) {
			return resolveCanvasToken(token);
		}

		const strokeFamily = resolveStrokeFamilyToken(theme, token);
		if (strokeFamily !== undefined) {
			return strokeFamily;
		}

		return undefined;
	}

	/// The `left`/`top`/`inset`/`translate`/`order`/`basis` families all read a
	/// spacing-or-fraction payload; only where the resolved distance lands differs.
	function resolvePositionalToken(
		theme: RuntimeTheme,
		family: string,
		key: string,
		negative: boolean,
	): RuntimeResolvedEffectBundle | undefined {
		if (family === "order-") {
			const order = __VelaValue.resolveLayoutOrderValue(key, negative);
			return order === undefined ? undefined : propEffect("LayoutOrder", order);
		}

		if (family === "basis-") {
			// Main-axis size; the flex default is a row, so basis maps to the width
			// axis exactly like `w-*`.
			if (isAutomaticSizeKey(key)) {
				return propEffect("AutoX", true);
			}

			const value = __VelaValue.resolveSizeAxisValue(theme, key);
			return value === undefined
				? undefined
				: propEffect("SizeX", __VelaValue.formatSizeAxis(value));
		}

		const axis = __VelaValue.resolvePositionAxisValue(theme, key, negative);
		if (axis === undefined) {
			return undefined;
		}

		if (family === "translate-x-") {
			return propEffect("TranslateX", axis);
		}

		if (family === "translate-y-") {
			return propEffect("TranslateY", axis);
		}

		if (family === "left-") {
			return propEffect("PositionX", axis);
		}

		if (family === "top-") {
			return propEffect("PositionY", axis);
		}

		if (family === "right-") {
			return propEffect("PositionX", __VelaValue.endRelativePositionAxis(axis));
		}

		if (family === "bottom-") {
			return propEffect("PositionY", __VelaValue.endRelativePositionAxis(axis));
		}

		return propsEffect([
			{ name: "PositionX", value: axis },
			{ name: "PositionY", value: axis },
		]);
	}

	function listLayoutEffect(
		name: string,
		value: RuntimePropValue,
	): RuntimeResolvedEffectBundle {
		return helperEffect("uilistlayout", [{ name, value }]);
	}

	function resolveBorderToken(
		theme: RuntimeTheme,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		if (key === "0" || key === "1" || key === "2" || key === "4") {
			return helperEffect("uistroke", [
				{ name: "Thickness", value: __VelaLua.toNumber(key) ?? 0 },
			]);
		}

		const arbitraryThickness = __VelaValue.parseArbitraryLength(key);
		if (arbitraryThickness !== undefined) {
			return helperEffect("uistroke", [
				{ name: "Thickness", value: arbitraryThickness },
			]);
		}

		if (key === "transparent") {
			return helperEffect("uistroke", [{ name: "Transparency", value: 1 }]);
		}

		const lineJoin = __VelaValue.resolveLineJoinValue(key);
		if (lineJoin !== undefined) {
			return helperEffect("uistroke", [
				{ name: "LineJoinMode", value: lineJoin },
			]);
		}

		if (__VelaValue.isUnsupportedBorderKey(key)) {
			return undefined;
		}

		return strokeColorEffect(theme, key);
	}

	function strokeThicknessEffect(
		thickness: number,
	): RuntimeResolvedEffectBundle {
		return helperEffect("uistroke", [
			{ name: "Thickness", value: thickness },
			{ name: "ApplyStrokeMode", value: Enum.ApplyStrokeMode.Border },
		]);
	}

	/// `ring`/`outline` payloads with a stroke meaning; anything else is a color.
	function resolveStrokeThickness(
		isOutline: boolean,
		key: string,
	): number | undefined {
		if (
			key === "0" ||
			key === "1" ||
			key === "2" ||
			key === "4" ||
			key === "8"
		) {
			return __VelaLua.toNumber(key);
		}

		if (isOutline && (key === "none" || key === "hidden")) {
			return 0;
		}

		return __VelaValue.parseArbitraryLength(key);
	}

	function isUnsupportedStrokeKey(key: string): boolean {
		if (
			key === "inset" ||
			key === "solid" ||
			key === "dashed" ||
			key === "dotted" ||
			key === "double"
		) {
			return true;
		}

		if (__VelaLua.startsWith(key, "offset-")) {
			return true;
		}

		return __VelaLua.toNumber(key) !== undefined;
	}

	function strokeColorEffect(
		theme: RuntimeTheme,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = __VelaColor.splitColorOpacity(key);
		const resolved = __VelaColor.resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return helperEffect("uistroke", [{ name: "Transparency", value: 1 }]);
		}

		return helperEffect("uistroke", [
			{ name: "Color", value: resolved.color },
			{
				name: "Transparency",
				value:
					opacity === undefined
						? 0
						: __VelaValue.opacityToTransparency(opacity),
			},
		]);
	}

	function shadowPresetEffect(
		blur: number,
		offsetY: number,
		spread: number,
		transparency: number,
	): RuntimeResolvedEffectBundle {
		const props: RuntimeResolvedPropEntry[] = [
			{ name: "BlurRadius", value: new UDim(0, blur) },
			{ name: "Offset", value: UDim2.fromOffset(0, offsetY) },
		];

		if (spread !== 0) {
			props.push({ name: "Spread", value: UDim2.fromOffset(spread, spread) });
		}

		props.push({ name: "Transparency", value: transparency });
		return helperEffect("uishadow", props);
	}

	function resolveShadowPreset(
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		if (key === "sm") return shadowPresetEffect(2, 1, 0, 0.95);
		if (key === "md") return shadowPresetEffect(6, 4, -1, 0.9);
		if (key === "lg") return shadowPresetEffect(15, 10, -3, 0.9);
		if (key === "xl") return shadowPresetEffect(25, 20, -5, 0.9);
		if (key === "2xl") return shadowPresetEffect(50, 25, -12, 0.75);
		return undefined;
	}

	function shadowColorEffect(
		theme: RuntimeTheme,
		key: string,
	): RuntimeResolvedEffectBundle | undefined {
		const [base, opacity] = __VelaColor.splitColorOpacity(key);
		const resolved = __VelaColor.resolveThemeColor(theme, base);
		if (resolved === undefined) {
			return undefined;
		}

		if (resolved.color === undefined) {
			return helperEffect("uishadow", [{ name: "Transparency", value: 1 }]);
		}

		const props: RuntimeResolvedPropEntry[] = [
			{ name: "Color", value: resolved.color },
		];
		if (opacity !== undefined) {
			props.push({
				name: "Transparency",
				value: __VelaValue.opacityToTransparency(opacity),
			});
		}

		return helperEffect("uishadow", props);
	}
}
