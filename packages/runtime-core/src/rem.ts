import type {
	RuntimeCamera,
	RuntimePropValue,
	RuntimeRemConfig,
} from "./types";

/// One rem is what an offset in a utility is worth, and it follows the viewport
/// so the same class reads at the same visual weight on a phone and on a 4K
/// monitor. The curve is Littensy's rem provider: the diagonal against a base
/// resolution, an aspect cap so an ultrawide does not inflate the scale, and a
/// gentler falloff in portrait.
export namespace __VelaRem {
	const MAX_ASPECT_RATIO = 19 / 9;

	/// Where a portrait viewport's factor starts, instead of falling to zero
	/// with its diagonal.
	const PORTRAIT_FLOOR = 0.25;

	const DEFAULT_CONFIG: RuntimeRemConfig = {
		base: 16,
		min: 16,
		max: 16,
		baseResolution: { x: 1920, y: 1020 },
	};

	let config = DEFAULT_CONFIG;
	const configured: Array<() => void> = [];

	/// A host runtime puts its own reactive layer over this curve — a binding
	/// under React, a source under Vide — and only it knows how to push the new
	/// value out when a config arrives after that layer is already live. More
	/// than one thing can be reading the curve, so they all hear about it.
	export function whenConfigured(listener: () => void) {
		configured.push(listener);
	}

	export function configure(resolved: RuntimeRemConfig | undefined) {
		if (resolved === undefined) {
			return;
		}

		config = resolved;
		for (const listener of configured) {
			listener();
		}
	}

	export function resolve(camera: RuntimeCamera | undefined): number {
		const viewport = camera?.ViewportSize;
		const width = viewport?.X ?? 0;
		const height = viewport?.Y ?? 0;

		// ViewportSize stays 1x1 until the first frame renders, and clamping that
		// to the minimum would paint one frame at the wrong scale.
		if (width <= 1 || height <= 1) {
			return math.clamp(config.base, config.min, config.max);
		}

		const boundedWidth = math.min(width, height * MAX_ASPECT_RATIO);
		const diagonal = math.sqrt(boundedWidth * boundedWidth + height * height);
		const baseDiagonal = math.sqrt(
			config.baseResolution.x * config.baseResolution.x +
				config.baseResolution.y * config.baseResolution.y,
		);
		const scale = baseDiagonal > 0 ? diagonal / baseDiagonal : 1;
		const landscape = boundedWidth > height || scale >= 1;
		const factor = landscape
			? scale
			: PORTRAIT_FLOOR + scale * (1 - PORTRAIT_FLOOR);

		return math.clamp(math.round(config.base * factor), config.min, config.max);
	}

	/// What a literal offset in the emit multiplies by. 1 at the base
	/// resolution, so a project that never resizes gets its numbers back.
	export function ratio(rem: number): number {
		return config.base > 0 ? rem / config.base : 1;
	}

	/// The rem a ratio of 1 comes out of, which is what a pinned subtree
	/// resolves against: under a `SurfaceGui` the offsets are the literal ones.
	export function base(): number {
		return config.base;
	}

	/// What a `[2rem]` payload is worth before the viewport has its say, which
	/// is the same base the compiler resolves such a payload against.
	export function pixels(rem: number): number {
		return rem * config.base;
	}

	/// Roblox stops honoring `TextSize` past 100 and does it silently, so a
	/// scaled size stops there too. Left uncapped, a transition would tween
	/// toward a size the engine never paints and stall part-way.
	export const TEXT_SIZE_CEILING = 100;

	/// Props whose numbers are pixel offsets. Everything else a utility writes is
	/// a scale, a color, an alignment or an order, and rem must leave those
	/// alone — `UIGradient.Offset` is normalized, `UIScale.Scale` is a multiplier.
	const SCALED_PROPS: Record<string, true> = {
		BlurRadius: true,
		BottomLeftRadius: true,
		BottomRightRadius: true,
		CellPadding: true,
		CellSize: true,
		CornerRadius: true,
		GapOffset: true,
		GridCrossExtent: true,
		MaxHeight: true,
		MaxSize: true,
		MaxWidth: true,
		MinHeight: true,
		MinSize: true,
		MinWidth: true,
		Padding: true,
		PaddingBottom: true,
		PaddingLeft: true,
		PaddingRight: true,
		PaddingTop: true,
		Position: true,
		PositionX: true,
		PositionY: true,
		ScrollBarThickness: true,
		Size: true,
		SizeX: true,
		SizeY: true,
		Spread: true,
		TextSize: true,
		Thickness: true,
		TopLeftRadius: true,
		TopRightRadius: true,
		TranslateX: true,
		TranslateY: true,
	};

	export function scalesProp(name: string): boolean {
		return SCALED_PROPS[name] === true;
	}

	export function scalesHelperProp(tag: string, name: string): boolean {
		return scalesProp(name) || (tag === "uishadow" && name === "Offset");
	}

	export function apply(
		value: RuntimePropValue,
		remRatio: number,
	): RuntimePropValue {
		if (remRatio === 1) {
			return value;
		}

		if (typeIs(value, "number")) {
			return value * remRatio;
		}

		if (typeIs(value, "UDim")) {
			return new UDim(value.Scale, value.Offset * remRatio);
		}

		if (typeIs(value, "UDim2")) {
			return new UDim2(
				value.X.Scale,
				value.X.Offset * remRatio,
				value.Y.Scale,
				value.Y.Offset * remRatio,
			);
		}

		if (typeIs(value, "Vector2")) {
			return new Vector2(value.X * remRatio, value.Y * remRatio);
		}

		return value;
	}
}
