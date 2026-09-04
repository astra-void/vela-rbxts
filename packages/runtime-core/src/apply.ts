import { __VelaDefaults } from "./defaults";
import { __VelaLua } from "./lua";
import { __VelaRem } from "./rem";
import type {
	ClassValue,
	RuntimeEffectBundle,
	RuntimeHelper,
	RuntimeHelperProp,
	RuntimePropMap,
	RuntimePropValue,
	RuntimeResolution,
	RuntimeResolvedEffectBundle,
	RuntimeResolvedPropEntry,
} from "./types";
import { __VelaValue } from "./value";

export namespace __VelaApply {
	export function normalizeClassValue(value: ClassValue | undefined): string[] {
		const tokens: string[] = [];

		const visit = (entry: ClassValue | undefined): void => {
			if (entry === undefined || entry === false) {
				return;
			}

			if (typeOf(entry) === "string" || typeOf(entry) === "number") {
				for (const token of __VelaLua.splitWhitespace(
					__VelaLua.toText(entry as string | number),
				)) {
					if (__VelaLua.stringLength(token) > 0) {
						tokens.push(token);
					}
				}
				return;
			}

			if (typeOf(entry) === "boolean") {
				return;
			}

			if (__VelaLua.isArrayValue(entry)) {
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

	export function normalizeChildren(children: unknown): defined[] {
		if (children === undefined || children === false) {
			return [];
		}

		if (children === true) {
			return [];
		}

		if (__VelaLua.isArrayValue(children)) {
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

	export function applyEffectBundle(
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
			setResolvedHelperProp(
				resolution.helpers,
				helper.tag,
				helper.props.map((prop) => ({
					name: prop.name,
					value: scaleHelperProp(
						helper.tag,
						prop.name,
						parseRuntimePropValue(prop.value),
						resolution,
					),
				})),
			);
		}
	}

	export function applyResolvedEffectBundle(
		resolution: RuntimeResolution,
		effects: RuntimeResolvedEffectBundle,
	) {
		for (const prop of effects.props) {
			applyResolutionProp(resolution, prop.name, prop.value);
		}

		for (const helper of effects.helpers) {
			setResolvedHelperProp(
				resolution.helpers,
				helper.tag,
				helper.props.map((prop) => ({
					name: prop.name,
					value: scaleHelperProp(helper.tag, prop.name, prop.value, resolution),
				})),
			);
		}
	}

	/// Only a value arriving from a rule or a class token is scaled here. What
	/// the composition steps below write is derived from resolution fields that
	/// were already scaled on the way in.
	function scaleHelperProp(
		tag: string,
		name: string,
		value: RuntimePropValue,
		resolution: RuntimeResolution,
	): RuntimePropValue {
		const remRatio = resolution.remRatio ?? 1;

		return remRatio !== 1 && __VelaRem.scalesHelperProp(tag, name)
			? __VelaRem.apply(value, remRatio)
			: value;
	}

	/// Several utility families only meet at the end — two axes of one `Size`, the
	/// three parts of a `FontFace`, a grid track and the gap it has to give back.
	/// They travel as their own entries and are composed here, once every rule and
	/// class token has had its say.
	function applyResolutionProp(
		resolution: RuntimeResolution,
		name: string,
		rawValue: RuntimePropValue,
	) {
		const remRatio = resolution.remRatio ?? 1;
		const value =
			remRatio !== 1 && __VelaRem.scalesProp(name)
				? __VelaRem.apply(rawValue, remRatio)
				: rawValue;

		if (name === "OpacityAlpha") {
			if (typeIs(value, "number")) {
				resolution.opacityAlpha = value;
			}
			return;
		}

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

		// An axis can be given a size or handed to Roblox, never both — whichever
		// token comes last wins, matching the rule for every other utility.
		if (name === "AutoX") {
			resolution.autoWidth = value === true;
			if (value === true) {
				resolution.sizeWidth = undefined;
			}
			return;
		}

		if (name === "AutoY") {
			resolution.autoHeight = value === true;
			if (value === true) {
				resolution.sizeHeight = undefined;
			}
			return;
		}

		if (name === "PositionX") {
			if (typeIs(value, "UDim")) {
				resolution.positionX = value;
			}
			return;
		}

		if (name === "PositionY") {
			if (typeIs(value, "UDim")) {
				resolution.positionY = value;
			}
			return;
		}

		if (name === "TranslateX") {
			if (typeIs(value, "UDim")) {
				resolution.translateX = value;
			}
			return;
		}

		if (name === "TranslateY") {
			if (typeIs(value, "UDim")) {
				resolution.translateY = value;
			}
			return;
		}

		if (
			name === "MinWidth" ||
			name === "MinHeight" ||
			name === "MaxWidth" ||
			name === "MaxHeight"
		) {
			if (typeIs(value, "number")) {
				if (name === "MinWidth") {
					resolution.minWidth = value;
				} else if (name === "MinHeight") {
					resolution.minHeight = value;
				} else if (name === "MaxWidth") {
					resolution.maxWidth = value;
				} else {
					resolution.maxHeight = value;
				}
			}
			return;
		}

		// Roblox folds family, weight and style into one `FontFace`, so none of them
		// can be written straight onto the instance.
		if (name === "FontFamily") {
			if (typeIs(value, "string")) {
				resolution.fontFamily = value;
			}
			return;
		}

		if (name === "FontWeight") {
			if (typeIs(value, "EnumItem")) {
				resolution.fontWeight = value as Enum.FontWeight;
			}
			return;
		}

		if (name === "FontStyle") {
			if (typeIs(value, "EnumItem")) {
				resolution.fontStyle = value as Enum.FontStyle;
			}
			return;
		}

		if (name === "GapOffset") {
			if (typeIs(value, "number")) {
				resolution.gapOffset = value;
			}
			return;
		}

		if (name === "GridCells") {
			if (typeIs(value, "number")) {
				resolution.gridCells = value;
			}
			return;
		}

		if (name === "GridCellsHorizontal") {
			resolution.gridCellsHorizontal = value === true;
			return;
		}

		if (name === "GridCrossExtent") {
			if (typeIs(value, "number")) {
				resolution.gridCrossExtent = value;
			}
			return;
		}

		if (name === "GradientRotation") {
			if (typeIs(value, "number")) {
				resolution.gradientRotation = value;
			}
			return;
		}

		if (
			name === "GradientFrom" ||
			name === "GradientVia" ||
			name === "GradientTo"
		) {
			if (typeIs(value, "Color3")) {
				if (name === "GradientFrom") {
					resolution.gradientFrom = value;
				} else if (name === "GradientVia") {
					resolution.gradientVia = value;
				} else {
					resolution.gradientTo = value;
				}
			}
			return;
		}

		if (
			name === "GradientFromTransparency" ||
			name === "GradientViaTransparency" ||
			name === "GradientToTransparency"
		) {
			if (typeIs(value, "number")) {
				if (name === "GradientFromTransparency") {
					resolution.gradientFromTransparency = value;
				} else if (name === "GradientViaTransparency") {
					resolution.gradientViaTransparency = value;
				} else {
					resolution.gradientToTransparency = value;
				}
			}
			return;
		}

		setProp(resolution.props, name, value);
	}

	export function applyComposedResolution(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
		preflight: boolean,
	) {
		applyComposedFont(hostProps, resolution);
		applyComposedSize(hostProps, resolution);
		applyComposedTransform(hostProps, resolution);
		applyComposedSizeConstraints(resolution);
		applyComposedGrid(resolution);
		applyComposedGradient(hostProps, resolution, preflight);
	}

	function applyComposedFont(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
	) {
		const family = resolution.fontFamily;
		const weight = resolution.fontWeight;
		const style = resolution.fontStyle;
		if (family === undefined && weight === undefined && style === undefined) {
			return;
		}

		const declared = hostProps.FontFace;
		const isFont = typeIs(declared, "Font");
		hostProps.FontFace = new Font(
			family ?? (isFont ? declared.Family : __VelaDefaults.DEFAULT_FONT_FAMILY),
			weight ?? (isFont ? declared.Weight : Enum.FontWeight.Regular),
			style ?? (isFont ? declared.Style : Enum.FontStyle.Normal),
		);
	}

	function applyComposedSize(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
	) {
		const autoWidth = resolution.autoWidth === true;
		const autoHeight = resolution.autoHeight === true;
		if (autoWidth || autoHeight) {
			if (autoWidth && autoHeight) {
				hostProps.AutomaticSize = Enum.AutomaticSize.XY;
			} else if (autoWidth) {
				hostProps.AutomaticSize = Enum.AutomaticSize.X;
			} else {
				hostProps.AutomaticSize = Enum.AutomaticSize.Y;
			}
		}

		const width = resolution.sizeWidth;
		const height = resolution.sizeHeight;
		if (width === undefined && height === undefined) {
			return;
		}

		const declared = hostProps.Size;
		const base = typeIs(declared, "UDim2") ? declared : new UDim2(0, 0, 0, 0);
		const resolvedWidth = width ?? base.X;
		const resolvedHeight = height ?? base.Y;

		hostProps.Size = new UDim2(
			resolvedWidth.Scale,
			resolvedWidth.Offset,
			resolvedHeight.Scale,
			resolvedHeight.Offset,
		);
	}

	/// A fractional translate is a shift by the element's own size, which is exactly
	/// what `AnchorPoint` expresses; pixel translates shift `Position`.
	export function applyComposedTransform(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
	) {
		const [translateAnchorX, shiftX] = splitTranslateAxis(
			resolution.translateX,
		);
		const [translateAnchorY, shiftY] = splitTranslateAxis(
			resolution.translateY,
		);
		const anchorX =
			translateAnchorX ?? (resolution.centerX === true ? 0.5 : undefined);
		const anchorY =
			translateAnchorY ?? (resolution.centerY === true ? 0.5 : undefined);
		if (anchorX !== undefined || anchorY !== undefined) {
			hostProps.AnchorPoint = new Vector2(anchorX ?? 0, anchorY ?? 0);
		}

		// The translate half already met rem on its way into the resolution; a
		// negative margin token wrote its offset straight to the shift.
		const remRatio = resolution.remRatio ?? 1;
		const positionX = shiftPositionAxis(
			resolution.positionX,
			shiftX + (resolution.marginShiftX ?? 0) * remRatio,
		);
		const positionY = shiftPositionAxis(
			resolution.positionY,
			shiftY + (resolution.marginShiftY ?? 0) * remRatio,
		);
		if (positionX === undefined && positionY === undefined) {
			return;
		}

		const declared = hostProps.Position;
		const base = typeIs(declared, "UDim2") ? declared : new UDim2(0, 0, 0, 0);
		const resolvedX = positionX ?? base.X;
		const resolvedY = positionY ?? base.Y;

		hostProps.Position = new UDim2(
			resolvedX.Scale,
			resolvedX.Offset,
			resolvedY.Scale,
			resolvedY.Offset,
		);
	}

	function splitTranslateAxis(
		axis: UDim | undefined,
	): [number | undefined, number] {
		if (axis === undefined) {
			return [undefined, 0];
		}

		// AnchorPoint moves opposite the shift, so the scale is negated.
		const anchor =
			__VelaLua.mathAbs(axis.Scale) < 1e-9 ? undefined : -axis.Scale;
		return [anchor, axis.Offset];
	}

	function shiftPositionAxis(
		axis: UDim | undefined,
		shift: number,
	): UDim | undefined {
		if (__VelaLua.mathAbs(shift) < 1e-9) {
			return axis;
		}

		const base = axis ?? new UDim(0, 0);
		return new UDim(base.Scale, base.Offset + shift);
	}

	export function applyComposedSizeConstraints(resolution: RuntimeResolution) {
		if (
			resolution.minWidth !== undefined ||
			resolution.minHeight !== undefined
		) {
			setResolvedHelperProp(resolution.helpers, "uisizeconstraint", [
				{
					name: "MinSize",
					value: new Vector2(
						resolution.minWidth ?? 0,
						resolution.minHeight ?? 0,
					),
				},
			]);
		}

		if (
			resolution.maxWidth !== undefined ||
			resolution.maxHeight !== undefined
		) {
			setResolvedHelperProp(resolution.helpers, "uisizeconstraint", [
				{
					name: "MaxSize",
					value: new Vector2(
						resolution.maxWidth ?? math.huge,
						resolution.maxHeight ?? math.huge,
					),
				},
			]);
		}
	}

	/// Roblox's stock `UIGridLayout.CellSize` extent. `grid-cols-*` divides the axis
	/// it fills and leaves the cross axis here, since a column count says nothing
	/// about row height.
	export const GRID_CROSS_AXIS_DEFAULT = 100;

	/// `UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size`
	/// the child set for itself, so a grid that never names a cell size collapses
	/// the whole track to Roblox's 100x100 default.
	export function applyComposedGrid(resolution: RuntimeResolution) {
		const grid = resolution.helpers.find(
			(helper) => helper.tag === "uigridlayout",
		);
		if (grid === undefined) {
			return;
		}

		const gap = resolution.gapOffset ?? 0;
		const cells = resolution.gridCells;
		if (cells !== undefined && cells > 0) {
			const scale = 1 / cells;
			const gapShare = (gap * (cells - 1)) / cells;
			// `gridCrossExtent` met rem on its way into the resolution; the
			// stock extent standing in for it has not, and the static path
			// scales the same number.
			const cross =
				resolution.gridCrossExtent ??
				GRID_CROSS_AXIS_DEFAULT * (resolution.remRatio ?? 1);
			setResolvedHelperProp(resolution.helpers, "uigridlayout", [
				{
					name: "CellSize",
					value:
						resolution.gridCellsHorizontal === true
							? new UDim2(scale, -gapShare, 0, cross)
							: new UDim2(0, cross, scale, -gapShare),
				},
			]);
		}

		if (resolution.gapOffset !== undefined) {
			setResolvedHelperProp(resolution.helpers, "uigridlayout", [
				{ name: "CellPadding", value: UDim2.fromOffset(gap, gap) },
			]);
		}
	}

	export function applyComposedGradient(
		hostProps: Record<string, unknown>,
		resolution: RuntimeResolution,
		preflight: boolean,
	) {
		const stops: Color3[] = [];
		const alphas: number[] = [];
		let faded = false;
		for (const [stop, transparency] of [
			[resolution.gradientFrom, resolution.gradientFromTransparency],
			[resolution.gradientVia, resolution.gradientViaTransparency],
			[resolution.gradientTo, resolution.gradientToTransparency],
		] as Array<[Color3 | undefined, number | undefined]>) {
			if (stop !== undefined) {
				stops.push(stop);
				alphas.push(transparency ?? 0);
				faded = faded || transparency !== undefined;
			}
		}

		const color = colorSequenceValue(stops);
		if (color === undefined) {
			return;
		}

		setResolvedHelperProp(resolution.helpers, "uigradient", [
			{ name: "Color", value: color },
		]);

		if (faded) {
			const transparency = numberSequenceValue(alphas);
			if (transparency !== undefined) {
				setResolvedHelperProp(resolution.helpers, "uigradient", [
					{ name: "Transparency", value: transparency },
				]);
			}
		}

		const rotation = resolution.gradientRotation;
		if (rotation !== undefined && rotation !== 0) {
			setResolvedHelperProp(resolution.helpers, "uigradient", [
				{ name: "Rotation", value: rotation },
			]);
		}

		// UIGradient modulates BackgroundColor3, so force a white base for true stop
		// colors — and take back the transparency preflight left behind.
		hostProps.BackgroundColor3 = Color3.fromRGB(255, 255, 255);
		if (preflight) {
			hostProps.BackgroundTransparency = 0;
		}
	}

	function colorSequenceValue(stops: Color3[]): ColorSequence | undefined {
		const [first, second] = stops;
		if (first === undefined) {
			return undefined;
		}

		if (second === undefined) {
			return new ColorSequence(first);
		}

		const last = __VelaLua.arraySize(stops) - 1;
		if (last === 1) {
			return new ColorSequence(first, second);
		}

		const keypoints: ColorSequenceKeypoint[] = [];
		for (let index = 0; index <= last; index++) {
			const stop = stops[index];
			if (stop !== undefined) {
				keypoints.push(new ColorSequenceKeypoint(index / last, stop));
			}
		}

		return new ColorSequence(keypoints);
	}

	function numberSequenceValue(stops: number[]): NumberSequence | undefined {
		const [first, second] = stops;
		if (first === undefined) {
			return undefined;
		}

		if (second === undefined) {
			return new NumberSequence(first);
		}

		const last = __VelaLua.arraySize(stops) - 1;
		if (last === 1) {
			return new NumberSequence(first, second);
		}

		const keypoints: NumberSequenceKeypoint[] = [];
		for (let index = 0; index <= last; index++) {
			const stop = stops[index];
			if (stop !== undefined) {
				keypoints.push(new NumberSequenceKeypoint(index / last, stop));
			}
		}

		return new NumberSequence(keypoints);
	}

	export function setProp(
		props: RuntimePropMap,
		name: string,
		value: RuntimePropValue,
	) {
		delete props[name];
		props[name] = value;
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

	/// Some Roblox helper defaults do not match their CSS-style utility semantics.
	export function applyHelperDefaults(helpers: RuntimeHelper[]) {
		for (const helper of helpers) {
			if (helper.tag === "uicorner") {
				const directionalProps = [
					"TopLeftRadius",
					"TopRightRadius",
					"BottomLeftRadius",
					"BottomRightRadius",
				];
				if (
					helper.props.find((prop) => directionalProps.includes(prop.name)) !==
					undefined
				) {
					const baseline =
						helper.props.find((prop) => prop.name === "CornerRadius")?.value ??
						new UDim(0, 0);
					helper.props = helper.props.filter(
						(prop) => prop.name !== "CornerRadius",
					);
					for (const name of directionalProps) {
						if (helper.props.find((prop) => prop.name === name) === undefined) {
							helper.props.push({ name, value: baseline });
						}
					}
				}
				continue;
			}

			// UIListLayout.SortOrder defaults to Name, which sorts children by their
			// instance name and silently ignores every `order-*`.
			if (helper.tag !== "uilistlayout") {
				continue;
			}

			if (
				helper.props.find((prop) => prop.name === "SortOrder") !== undefined
			) {
				continue;
			}

			helper.props.push({
				name: "SortOrder",
				value: Enum.SortOrder.LayoutOrder,
			});
		}
	}

	/// `@rbxts/react` maps a lowercase tag through a hardcoded class list and passes
	/// anything it does not know straight to `Instance.new`, which is case
	/// sensitive. `UIShadow` is missing from that list, so the lowercase form fails
	/// to instantiate and React unwinds the whole tree.
	export function hostClassName(tag: string): string {
		return tag === "uishadow" ? "UIShadow" : tag;
	}

	export function helperToProps(
		props: RuntimeHelperProp[],
	): Record<string, unknown> {
		const resolved: Record<string, unknown> = {};

		for (const prop of props) {
			resolved[prop.name] = prop.value;
		}

		return resolved;
	}

	export function parseRuntimePropValue(value: string): RuntimePropValue {
		const trimmed = __VelaLua.trim(value);

		const color = __VelaValue.parseColor3(trimmed);
		if (color !== undefined) {
			return color;
		}

		const udim = __VelaValue.parseUDim(trimmed);
		if (udim !== undefined) {
			return udim;
		}

		const udim2 = __VelaValue.parseUDim2(trimmed);
		if (udim2 !== undefined) {
			return udim2;
		}

		const vector = __VelaValue.parseVector2(trimmed);
		if (vector !== undefined) {
			return vector;
		}

		const sequence = __VelaValue.parseColorSequence(trimmed);
		if (sequence !== undefined) {
			return sequence;
		}

		const alphaSequence = __VelaValue.parseNumberSequence(trimmed);
		if (alphaSequence !== undefined) {
			return alphaSequence;
		}

		const font = __VelaValue.parseFont(trimmed);
		if (font !== undefined) {
			return font;
		}

		const enumValue = __VelaValue.parseEnumValue(trimmed);
		if (enumValue !== undefined) {
			return enumValue;
		}

		if (trimmed === "true") {
			return true;
		}

		if (trimmed === "false") {
			return false;
		}

		const numeric = __VelaLua.toNumber(trimmed);
		if (numeric !== undefined && __VelaLua.stringLength(trimmed) > 0) {
			return numeric;
		}

		return value;
	}
}
