import { __VelaLua } from "./lua";
import { __VelaRem } from "./rem";
import type {
	RuntimeResolvedPropEntry,
	RuntimeSizeAxisValue,
	RuntimeTheme,
} from "./types";

export namespace __VelaValue {
	export function resolveSpacingOffset(
		theme: RuntimeTheme,
		key: string,
	): number | undefined {
		const value = resolveSpacingValue(theme, key);
		if (value === undefined || value.Scale !== 0) {
			return undefined;
		}

		return value.Offset;
	}

	export function resolvePositionAxisValue(
		theme: RuntimeTheme,
		key: string,
		negative: boolean,
	): UDim | undefined {
		let base = parseArbitraryValue(key);

		if (base === undefined && key === "px") {
			base = { scale: 0, offset: 1 };
		}

		if (base === undefined && key === "full") {
			base = { scale: 1, offset: 0 };
		}

		if (base === undefined) {
			const fraction = resolveFractionScale(key);
			if (fraction !== undefined) {
				base = { scale: fraction, offset: 0 };
			}
		}

		if (base === undefined) {
			const offset = resolveSpacingOffset(theme, key);
			if (offset === undefined) {
				return undefined;
			}

			base = { scale: 0, offset };
		}

		return negative
			? new UDim(-base.scale, -base.offset)
			: new UDim(base.scale, base.offset);
	}

	/// Re-anchors a `left`/`top`-style axis to the far edge, mirroring CSS
	/// `right`/`bottom`: the resolved distance is measured back from scale 1.
	export function endRelativePositionAxis(axis: UDim): UDim {
		return new UDim(1 - axis.Scale, -axis.Offset);
	}

	export function resolveZIndexValue(key: string): number | undefined {
		if (key === "auto") {
			return undefined;
		}

		if (__VelaLua.startsWith(key, "[") && __VelaLua.endsWith(key, "]")) {
			// `ZIndex` is an integer, so a fractional arbitrary value would round
			// silently instead of doing what the class says.
			const arbitrary = parseArbitraryNumber(key, "");
			return arbitrary !== undefined && __VelaLua.isWholeNumber(arbitrary)
				? arbitrary
				: undefined;
		}

		if (
			key === "0" ||
			key === "10" ||
			key === "20" ||
			key === "30" ||
			key === "40" ||
			key === "50"
		) {
			return __VelaLua.toNumber(key);
		}

		return undefined;
	}

	export function resolveScaleValue(key: string): number | undefined {
		if (key === "0") return 0;
		if (key === "50") return 0.5;
		if (key === "75") return 0.75;
		if (key === "90") return 0.9;
		if (key === "95") return 0.95;
		if (key === "100") return 1;
		if (key === "105") return 1.05;
		if (key === "110") return 1.1;
		if (key === "125") return 1.25;
		if (key === "150") return 1.5;
		return undefined;
	}

	export function resolveRotationValue(
		key: string,
		negative: boolean,
	): number | undefined {
		const arbitrary = parseArbitraryNumber(key, "deg");
		if (arbitrary !== undefined) {
			return negative ? -arbitrary : arbitrary;
		}

		if (
			key !== "0" &&
			key !== "1" &&
			key !== "2" &&
			key !== "3" &&
			key !== "6" &&
			key !== "12" &&
			key !== "45" &&
			key !== "90" &&
			key !== "180"
		) {
			return undefined;
		}

		const degrees = __VelaLua.toNumber(key) ?? 0;
		return negative ? -degrees : degrees;
	}

	export function resolveOpacityValue(key: string): number | undefined {
		const percent = __VelaLua.toNumber(key);
		if (
			percent === undefined ||
			percent < 0 ||
			percent > 100 ||
			!__VelaLua.isWholeNumber(percent)
		) {
			return undefined;
		}

		return __VelaValue.opacityToTransparency(percent);
	}

	export function resolveAspectRatioValue(key: string): number | undefined {
		if (key === "square") {
			return 1;
		}

		if (key === "video") {
			return 16 / 9;
		}

		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		const inner = __VelaLua.substring(key, 1, -1);
		const [widthText, heightText] = __VelaLua.splitOnce(inner, "/");
		if (heightText === undefined) {
			const value = __VelaLua.toNumber(__VelaLua.trim(inner));
			return value !== undefined && value > 0 ? value : undefined;
		}

		const width = __VelaLua.toNumber(__VelaLua.trim(widthText));
		const height = __VelaLua.toNumber(__VelaLua.trim(heightText));
		if (
			width === undefined ||
			height === undefined ||
			width <= 0 ||
			height <= 0
		) {
			return undefined;
		}

		return width / height;
	}

	export function resolveAnchorPointValue(key: string): Vector2 | undefined {
		if (key === "top-left") return new Vector2(0, 0);
		if (key === "top") return new Vector2(0.5, 0);
		if (key === "top-right") return new Vector2(1, 0);
		if (key === "left") return new Vector2(0, 0.5);
		if (key === "center") return new Vector2(0.5, 0.5);
		if (key === "right") return new Vector2(1, 0.5);
		if (key === "bottom-left") return new Vector2(0, 1);
		if (key === "bottom") return new Vector2(0.5, 1);
		if (key === "bottom-right") return new Vector2(1, 1);
		return undefined;
	}

	export function resolveAlignSelfValue(
		key: string,
	): Enum.ItemLineAlignment | undefined {
		if (key === "auto") return Enum.ItemLineAlignment.Automatic;
		if (key === "start") return Enum.ItemLineAlignment.Start;
		if (key === "center") return Enum.ItemLineAlignment.Center;
		if (key === "end") return Enum.ItemLineAlignment.End;
		if (key === "stretch") return Enum.ItemLineAlignment.Stretch;
		return undefined;
	}

	/// `justify-*` runs along the main axis, which `UIListLayout` exposes as its
	/// horizontal properties. `between`/`around`/`evenly`/`stretch` need
	/// `UIFlexAlignment` rather than a plain alignment, so they land on a
	/// different property.
	export function resolveJustifyProp(
		key: string,
	): RuntimeResolvedPropEntry | undefined {
		if (key === "start") {
			return {
				name: "HorizontalAlignment",
				value: Enum.HorizontalAlignment.Left,
			};
		}
		if (key === "center") {
			return {
				name: "HorizontalAlignment",
				value: Enum.HorizontalAlignment.Center,
			};
		}
		if (key === "end") {
			return {
				name: "HorizontalAlignment",
				value: Enum.HorizontalAlignment.Right,
			};
		}
		if (key === "between") {
			return {
				name: "HorizontalFlex",
				value: Enum.UIFlexAlignment.SpaceBetween,
			};
		}
		if (key === "around") {
			return {
				name: "HorizontalFlex",
				value: Enum.UIFlexAlignment.SpaceAround,
			};
		}
		if (key === "evenly") {
			return {
				name: "HorizontalFlex",
				value: Enum.UIFlexAlignment.SpaceEvenly,
			};
		}
		if (key === "stretch") {
			return { name: "HorizontalFlex", value: Enum.UIFlexAlignment.Fill };
		}
		return undefined;
	}

	/// `items-*` runs along the cross axis, which `UIListLayout` exposes as its
	/// vertical properties.
	export function resolveAlignItemsProp(
		key: string,
	): RuntimeResolvedPropEntry | undefined {
		if (key === "start") {
			return { name: "VerticalAlignment", value: Enum.VerticalAlignment.Top };
		}
		if (key === "center") {
			return {
				name: "VerticalAlignment",
				value: Enum.VerticalAlignment.Center,
			};
		}
		if (key === "end") {
			return {
				name: "VerticalAlignment",
				value: Enum.VerticalAlignment.Bottom,
			};
		}
		if (key === "stretch") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.Fill };
		}
		return undefined;
	}

	export function opacityToTransparency(percent: number): number {
		return (100 - percent) / 100;
	}

	/// `content-*` distributes the cross axis, which `UIListLayout` exposes as its
	/// vertical properties — the same split `items-*` uses.
	export function resolveAlignContentProp(
		key: string,
	): RuntimeResolvedPropEntry | undefined {
		if (key === "between") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.SpaceBetween };
		}
		if (key === "around") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.SpaceAround };
		}
		if (key === "evenly") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.SpaceEvenly };
		}
		if (key === "stretch") {
			return { name: "VerticalFlex", value: Enum.UIFlexAlignment.Fill };
		}
		return resolveAlignItemsProp(key);
	}

	export function resolveFlexItemMode(
		token: string,
	): Enum.UIFlexMode | undefined {
		if (token === "grow") return Enum.UIFlexMode.Grow;
		if (token === "shrink" || token === "flex-initial") {
			return Enum.UIFlexMode.Shrink;
		}
		if (token === "flex-1" || token === "flex-auto")
			return Enum.UIFlexMode.Fill;
		if (token === "grow-0" || token === "shrink-0" || token === "flex-none") {
			return Enum.UIFlexMode.None;
		}
		return undefined;
	}

	export function resolveLineJoinValue(
		key: string,
	): Enum.LineJoinMode | undefined {
		if (key === "round") return Enum.LineJoinMode.Round;
		if (key === "bevel") return Enum.LineJoinMode.Bevel;
		if (key === "miter") return Enum.LineJoinMode.Miter;
		return undefined;
	}

	export function resolveObjectFitValue(
		key: string,
	): Enum.ScaleType | undefined {
		if (key === "cover") return Enum.ScaleType.Crop;
		if (key === "contain") return Enum.ScaleType.Fit;
		if (key === "fill") return Enum.ScaleType.Stretch;
		if (key === "tile") return Enum.ScaleType.Tile;
		return undefined;
	}

	export function resolvePointerEventsValue(key: string): boolean | undefined {
		if (key === "none") return false;
		if (key === "auto") return true;
		return undefined;
	}

	export function resolveWhitespaceValue(key: string): boolean | undefined {
		if (key === "normal") return true;
		if (key === "nowrap") return false;
		return undefined;
	}

	export function resolveOverflowValue(key: string): boolean | undefined {
		if (key === "hidden" || key === "clip") return true;
		if (key === "visible") return false;
		return undefined;
	}

	export function resolveTextWrapValue(key: string): boolean | undefined {
		if (key === "wrap") return true;
		if (key === "nowrap") return false;
		return undefined;
	}

	export function resolveOverscrollValue(
		key: string,
	): Enum.ElasticBehavior | undefined {
		if (key === "auto") return Enum.ElasticBehavior.Always;
		if (key === "contain") return Enum.ElasticBehavior.WhenScrollable;
		if (key === "none") return Enum.ElasticBehavior.Never;
		return undefined;
	}

	export function resolveScrollDirectionValue(
		key: string,
	): Enum.ScrollingDirection | undefined {
		if (key === "x") return Enum.ScrollingDirection.X;
		if (key === "y") return Enum.ScrollingDirection.Y;
		if (key === "xy") return Enum.ScrollingDirection.XY;
		return undefined;
	}

	export function resolveCanvasSizeValue(
		key: string,
	): Enum.AutomaticSize | undefined {
		if (key === "auto") return Enum.AutomaticSize.XY;
		if (key === "auto-x") return Enum.AutomaticSize.X;
		if (key === "auto-y") return Enum.AutomaticSize.Y;
		if (key === "none") return Enum.AutomaticSize.None;
		return undefined;
	}

	export function resolveGridCellCount(key: string): number | undefined {
		const count = __VelaLua.toNumber(key);
		if (
			count === undefined ||
			!__VelaLua.isWholeNumber(count) ||
			count < 1 ||
			count > 12
		) {
			return undefined;
		}

		return count;
	}

	export function resolveGradientRotation(
		direction: string,
	): number | undefined {
		if (direction === "r") return 0;
		if (direction === "br") return 45;
		if (direction === "b") return 90;
		if (direction === "bl") return 135;
		if (direction === "l") return 180;
		if (direction === "tl") return 225;
		if (direction === "t") return 270;
		if (direction === "tr") return 315;
		return undefined;
	}

	export function resolveLineHeightValue(key: string): number | undefined {
		const arbitrary = parseArbitraryNumber(key, "");
		if (arbitrary !== undefined) {
			return arbitrary;
		}

		if (key === "none") return 1;
		if (key === "tight") return 1.25;
		if (key === "snug") return 1.375;
		if (key === "normal") return 1.5;
		if (key === "relaxed") return 1.625;
		if (key === "loose") return 2;
		return undefined;
	}

	export function resolveLayoutOrderValue(
		key: string,
		negative: boolean,
	): number | undefined {
		if (key === "first" || key === "last" || key === "none") {
			if (negative) {
				return undefined;
			}

			return key === "first" ? -9999 : key === "last" ? 9999 : 0;
		}

		const order = __VelaLua.toNumber(key);
		if (order === undefined || !__VelaLua.isWholeNumber(order)) {
			return undefined;
		}

		return negative ? -order : order;
	}

	export function resolveTextYAlignmentValue(
		key: string,
	): Enum.TextYAlignment | undefined {
		if (key === "top") return Enum.TextYAlignment.Top;
		if (key === "middle") return Enum.TextYAlignment.Center;
		if (key === "bottom") return Enum.TextYAlignment.Bottom;
		return undefined;
	}

	export function isUnsupportedBorderKey(key: string): boolean {
		if (
			key === "dashed" ||
			key === "solid" ||
			key === "dotted" ||
			key === "double"
		) {
			return true;
		}

		if (
			key === "x" ||
			key === "y" ||
			key === "t" ||
			key === "r" ||
			key === "b" ||
			key === "l"
		) {
			return true;
		}

		if (
			__VelaLua.startsWith(key, "x-") ||
			__VelaLua.startsWith(key, "y-") ||
			__VelaLua.startsWith(key, "t-") ||
			__VelaLua.startsWith(key, "r-") ||
			__VelaLua.startsWith(key, "b-") ||
			__VelaLua.startsWith(key, "l-")
		) {
			return true;
		}

		if (__VelaLua.startsWith(key, "opacity-")) {
			return true;
		}

		// A trailing `/N` lowers to `UIStroke.Transparency`; any other slash is a
		// Tailwind shape this family does not implement.
		const [base, opacity] = splitColorOpacity(key);
		if (opacity === undefined && __VelaLua.includesChar(base, "/")) {
			return true;
		}

		const numeric = __VelaLua.toNumber(key);
		if (numeric !== undefined) {
			return key !== "0" && key !== "1" && key !== "2" && key !== "4";
		}

		return false;
	}

	/// Splits a trailing `/N` opacity modifier off a color payload. Only a 0-100
	/// integer counts; anything else stays part of the key.
	export function splitColorOpacity(key: string): [string, number | undefined] {
		const separator = __VelaLua.lastIndexOf(key, "/");
		if (separator === -1) {
			return [key, undefined];
		}

		const percent = __VelaLua.toNumber(__VelaLua.substring(key, separator + 1));
		if (
			percent === undefined ||
			percent < 0 ||
			percent > 100 ||
			!__VelaLua.isWholeNumber(percent)
		) {
			return [key, undefined];
		}

		return [__VelaLua.substring(key, 0, separator), percent];
	}

	export function splitColorKey(key: string): [string, string | undefined] {
		const lastDash = __VelaLua.lastIndexOf(key, "-");
		if (lastDash === -1) {
			return [key, undefined];
		}

		const suffix = __VelaLua.substring(key, lastDash + 1);
		if (isColorShade(suffix)) {
			return [__VelaLua.substring(key, 0, lastDash), suffix];
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

	export function resolveRadiusValue(
		theme: RuntimeTheme,
		key: string,
	): UDim | undefined {
		return theme.radius[key] ?? resolveArbitraryUDim(key);
	}

	export function resolveSpacingValue(
		theme: RuntimeTheme,
		key: string,
	): UDim | undefined {
		return (
			theme.spacing[key] ??
			resolveArbitraryUDim(key) ??
			resolveNumericSpacingValue(key)
		);
	}

	export function resolveSizeAxisValue(
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

		return parseArbitraryValue(key);
	}

	function resolveArbitraryUDim(key: string): UDim | undefined {
		const value = parseArbitraryValue(key);
		if (value === undefined) {
			return undefined;
		}

		return new UDim(value.scale, value.offset);
	}

	function resolveNumericSpacingValue(key: string): UDim | undefined {
		if (__VelaLua.startsWith(key, "-") || __VelaLua.startsWith(key, "+")) {
			return undefined;
		}

		const numeric = __VelaLua.toNumber(key);
		if (numeric === undefined || numeric < 0) {
			return undefined;
		}

		if (!__VelaLua.isWholeNumber(numeric * 2)) {
			return undefined;
		}

		return new UDim(0, numeric * 4);
	}

	function resolveFractionScale(key: string): number | undefined {
		const [numeratorText, denominatorText] = __VelaLua.splitOnce(key, "/");
		if (denominatorText === undefined) {
			return undefined;
		}

		const numerator = __VelaLua.toNumber(numeratorText);
		const denominator = __VelaLua.toNumber(denominatorText);
		if (numerator === undefined || denominator === undefined) {
			return undefined;
		}

		if (
			!__VelaLua.isWholeNumber(numerator) ||
			!__VelaLua.isWholeNumber(denominator)
		) {
			return undefined;
		}

		const wholeNumerator = __VelaLua.mathFloor(numerator);
		const wholeDenominator = __VelaLua.mathFloor(denominator);
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

	export function formatSizeAxis(value: RuntimeSizeAxisValue): UDim {
		return new UDim(value.scale, value.offset);
	}

	/// Mirrors the compiler's `parse_arbitrary_value`: a percentage is a scale, and
	/// a length is an offset. The two must agree, or a class resolves differently
	/// depending on whether it was static or dynamic.
	function parseArbitraryValue(key: string): RuntimeSizeAxisValue | undefined {
		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		const inner = __VelaLua.substring(key, 1, -1);
		if (__VelaLua.endsWith(inner, "%")) {
			const percent = __VelaLua.toNumber(__VelaLua.substring(inner, 0, -1));
			return percent === undefined
				? undefined
				: { scale: percent / 100, offset: 0 };
		}

		const numeric = parseLength(inner);
		return numeric === undefined ? undefined : { scale: 0, offset: numeric };
	}

	/// Mirrors `parse_arbitrary_length`: the `[...]` payload of a family that
	/// only counts in pixels, where a percentage would have nothing to be a
	/// fraction of.
	export function parseArbitraryLength(key: string): number | undefined {
		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		return parseLength(__VelaLua.substring(key, 1, -1));
	}

	/// `px` and a unitless number already are pixels; `rem` is the unit the
	/// viewport scales by, so it lands as what one rem is worth at the base
	/// resolution and follows the curve from there like any other offset.
	function parseLength(inner: string): number | undefined {
		if (__VelaLua.endsWith(inner, "rem")) {
			const rem = __VelaLua.toNumber(__VelaLua.substring(inner, 0, -3));
			return rem === undefined ? undefined : __VelaRem.pixels(rem);
		}

		return __VelaLua.toNumber(
			__VelaLua.endsWith(inner, "px")
				? __VelaLua.substring(inner, 0, -2)
				: inner,
		);
	}

	/// The plain number behind a `[...]` payload, for families that count in
	/// something other than pixels.
	function parseArbitraryNumber(key: string, unit: string): number | undefined {
		if (!__VelaLua.startsWith(key, "[") || !__VelaLua.endsWith(key, "]")) {
			return undefined;
		}

		const inner = __VelaLua.substring(key, 1, -1);
		return __VelaLua.toNumber(
			unit !== "" && __VelaLua.endsWith(inner, unit)
				? __VelaLua.substring(inner, 0, -__VelaLua.stringLength(unit))
				: inner,
		);
	}

	export function parseColor3(value: string): Color3 | undefined {
		const args = __VelaLua.parseCallArguments(value, "Color3.fromRGB(", ")");
		if (args === undefined || __VelaLua.arraySize(args) !== 3) {
			return undefined;
		}

		const red = __VelaLua.toNumber(args[0]);
		const green = __VelaLua.toNumber(args[1]);
		const blue = __VelaLua.toNumber(args[2]);

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

	export function parseUDim(value: string): UDim | undefined {
		const args = __VelaLua.parseCallArguments(value, "new UDim(", ")");
		if (args === undefined || __VelaLua.arraySize(args) !== 2) {
			return undefined;
		}

		return new UDim(
			__VelaLua.toNumber(args[0]) ?? 0,
			__VelaLua.toNumber(args[1]) ?? 0,
		);
	}

	export function parseUDim2(value: string): UDim2 | undefined {
		const fromOffset = __VelaLua.parseCallArguments(
			value,
			"UDim2.fromOffset(",
			")",
		);
		if (fromOffset !== undefined && __VelaLua.arraySize(fromOffset) === 2) {
			return UDim2.fromOffset(
				__VelaLua.toNumber(fromOffset[0]) ?? 0,
				__VelaLua.toNumber(fromOffset[1]) ?? 0,
			);
		}

		const fromScale = __VelaLua.parseCallArguments(
			value,
			"UDim2.fromScale(",
			")",
		);
		if (fromScale !== undefined && __VelaLua.arraySize(fromScale) === 2) {
			return UDim2.fromScale(
				__VelaLua.toNumber(fromScale[0]) ?? 0,
				__VelaLua.toNumber(fromScale[1]) ?? 0,
			);
		}

		const constructed =
			__VelaLua.parseCallArguments(value, "new UDim2(", ")") ??
			__VelaLua.parseCallArguments(value, "UDim2.new(", ")");
		if (constructed === undefined || __VelaLua.arraySize(constructed) !== 4) {
			return undefined;
		}

		return new UDim2(
			__VelaLua.toNumber(constructed[0]) ?? 0,
			__VelaLua.toNumber(constructed[1]) ?? 0,
			__VelaLua.toNumber(constructed[2]) ?? 0,
			__VelaLua.toNumber(constructed[3]) ?? 0,
		);
	}

	export function parseVector2(value: string): Vector2 | undefined {
		const args =
			__VelaLua.parseCallArguments(value, "new Vector2(", ")") ??
			__VelaLua.parseCallArguments(value, "Vector2.new(", ")");
		if (args === undefined || __VelaLua.arraySize(args) !== 2) {
			return undefined;
		}

		return new Vector2(
			__VelaLua.toNumber(args[0]) ?? 0,
			__VelaLua.toNumber(args[1]) ?? 0,
		);
	}

	/// `new Font("family", Enum.FontWeight.Bold, Enum.FontStyle.Italic)`, with
	/// the last two optional the way the static path writes them.
	export function parseFont(value: string): Font | undefined {
		const args = __VelaLua.splitCallArguments(value, "new Font(", ")");
		if (args === undefined) {
			return undefined;
		}

		const size = __VelaLua.arraySize(args);
		if (size < 1 || size > 3) {
			return undefined;
		}

		const family = __VelaLua.unquote(args[0] ?? "");
		if (family === undefined) {
			return undefined;
		}

		const weight = parseEnumValue(args[1] ?? "") as Enum.FontWeight | undefined;
		const style = parseEnumValue(args[2] ?? "") as Enum.FontStyle | undefined;

		return new Font(
			family,
			weight ?? Enum.FontWeight.Regular,
			style ?? Enum.FontStyle.Normal,
		);
	}

	/// The two- and three-stop forms the gradient families write, plus the
	/// keypoint array a `via` stop turns into.
	export function parseColorSequence(value: string): ColorSequence | undefined {
		const args = __VelaLua.splitCallArguments(value, "new ColorSequence(", ")");
		if (args === undefined) {
			return undefined;
		}

		const first = args[0];
		if (first === undefined) {
			return undefined;
		}

		if (__VelaLua.startsWith(first, "[")) {
			const body = __VelaLua.substring(
				first,
				1,
				__VelaLua.stringLength(first) - 1,
			);
			const keypoints: ColorSequenceKeypoint[] = [];
			for (const entry of __VelaLua.splitTopLevel(body, ",")) {
				const parts = __VelaLua.splitCallArguments(
					__VelaLua.trim(entry),
					"new ColorSequenceKeypoint(",
					")",
				);
				const position = __VelaLua.toNumber(parts?.[0]);
				const color = parseColor3(parts?.[1] ?? "");
				if (position === undefined || color === undefined) {
					return undefined;
				}
				keypoints.push(new ColorSequenceKeypoint(position, color));
			}

			return __VelaLua.arraySize(keypoints) >= 2
				? new ColorSequence(keypoints)
				: undefined;
		}

		const start = parseColor3(first);
		if (start === undefined) {
			return undefined;
		}

		const second = args[1];
		if (second === undefined) {
			return new ColorSequence(start);
		}

		const stop = parseColor3(second);
		return stop === undefined ? undefined : new ColorSequence(start, stop);
	}

	/// The alpha half of a gradient, written by the `/N` modifier on a stop.
	export function parseNumberSequence(
		value: string,
	): NumberSequence | undefined {
		const args = __VelaLua.splitCallArguments(
			value,
			"new NumberSequence(",
			")",
		);
		if (args === undefined) {
			return undefined;
		}

		const first = args[0];
		if (first === undefined) {
			return undefined;
		}

		if (__VelaLua.startsWith(first, "[")) {
			const body = __VelaLua.substring(
				first,
				1,
				__VelaLua.stringLength(first) - 1,
			);
			const keypoints: NumberSequenceKeypoint[] = [];
			for (const entry of __VelaLua.splitTopLevel(body, ",")) {
				const parts = __VelaLua.splitCallArguments(
					__VelaLua.trim(entry),
					"new NumberSequenceKeypoint(",
					")",
				);
				const position = __VelaLua.toNumber(parts?.[0]);
				const alpha = __VelaLua.toNumber(parts?.[1]);
				if (position === undefined || alpha === undefined) {
					return undefined;
				}
				keypoints.push(new NumberSequenceKeypoint(position, alpha));
			}

			return __VelaLua.arraySize(keypoints) >= 2
				? new NumberSequence(keypoints)
				: undefined;
		}

		const start = __VelaLua.toNumber(first);
		if (start === undefined) {
			return undefined;
		}

		const second = args[1];
		if (second === undefined) {
			return new NumberSequence(start);
		}

		const stop = __VelaLua.toNumber(second);
		return stop === undefined ? undefined : new NumberSequence(start, stop);
	}

	export function parseEnumValue(value: string): EnumItem | undefined {
		if (!__VelaLua.startsWith(value, "Enum.")) {
			return undefined;
		}

		const segments = __VelaLua.splitBy(value, ".");
		if (__VelaLua.arraySize(segments) !== 3) {
			return undefined;
		}

		const [, categoryName, memberName] = segments;
		if (categoryName === undefined || memberName === undefined) {
			return undefined;
		}

		const registry = Enum as unknown as Record<
			string,
			Record<string, EnumItem> | undefined
		>;
		const category = registry[categoryName];
		if (category === undefined) {
			return undefined;
		}

		return category[memberName];
	}
}
