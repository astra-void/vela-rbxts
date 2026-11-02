import { __VelaLua } from "./lua";
import type {
	RuntimeMargin,
	RuntimeMarginState,
	RuntimeResolution,
	RuntimeTheme,
} from "./types";
import { __VelaValue } from "./value";

export namespace __VelaMargin {
	function marginState(resolution: RuntimeResolution): RuntimeMarginState {
		let state = resolution.margin;
		if (state === undefined) {
			state = {};
			resolution.margin = state;
		}
		return state;
	}

	/// Consumes the `m-*` family from dynamic class values. `mx-auto`/`my-auto`
	/// center instead of spacing, and a negative margin shifts `Position` because
	/// `UIPadding` cannot go below zero — only the two sides that can pull the
	/// element itself have a meaning, exactly as on the static path.
	export function applyMarginToken(
		theme: RuntimeTheme,
		token: string,
		resolution: RuntimeResolution,
	): boolean {
		const prefixes: Array<
			[string, Array<"top" | "right" | "bottom" | "left">]
		> = [
			["mx-", ["left", "right"]],
			["my-", ["top", "bottom"]],
			["mt-", ["top"]],
			["mr-", ["right"]],
			["mb-", ["bottom"]],
			["ml-", ["left"]],
			["m-", ["top", "right", "bottom", "left"]],
		];

		for (const [prefix, sides] of prefixes) {
			const negative = __VelaLua.startsWith(token, `-${prefix}`);
			if (!negative && !__VelaLua.startsWith(token, prefix)) {
				continue;
			}

			const key = __VelaLua.substring(
				token,
				__VelaLua.stringLength(prefix) + (negative ? 1 : 0),
			);
			if (key === "auto") {
				if (!negative && prefix === "mx-") {
					resolution.centerX = true;
					resolution.positionX = new UDim(0.5, 0);
				} else if (!negative && prefix === "my-") {
					resolution.centerY = true;
					resolution.positionY = new UDim(0.5, 0);
				}
				return true;
			}

			const value = __VelaValue.resolveSpacingValue(theme, key);
			if (value === undefined || value.Scale !== 0) {
				return true;
			}

			// One value per side, whichever token named it last, as on the static
			// path: a shift and a padding on the same side replace each other.
			if (negative) {
				if (prefix === "mt-") {
					resolution.marginShiftY = -value.Offset;
					if (resolution.margin !== undefined) {
						resolution.margin.top = undefined;
					}
				} else if (prefix === "ml-") {
					resolution.marginShiftX = -value.Offset;
					if (resolution.margin !== undefined) {
						resolution.margin.left = undefined;
					}
				}
				return true;
			}

			const state = marginState(resolution);
			for (const side of sides) {
				state[side] = value.Offset;
				if (side === "top") {
					resolution.marginShiftY = undefined;
				} else if (side === "left") {
					resolution.marginShiftX = undefined;
				}
			}
			return true;
		}

		return false;
	}

	/// Neither source has met rem yet — the static spec came straight from the
	/// emit, and a margin token writes its offset to the resolution rather than
	/// through the prop path — so the merged result is scaled once, here.
	export function resolveMarginConfig(
		base: RuntimeMargin | undefined,
		dynamic: RuntimeMarginState | undefined,
		remRatio: number,
	): RuntimeMargin | undefined {
		const margin: RuntimeMargin = {
			top: (dynamic?.top ?? base?.top ?? 0) * remRatio,
			right: (dynamic?.right ?? base?.right ?? 0) * remRatio,
			bottom: (dynamic?.bottom ?? base?.bottom ?? 0) * remRatio,
			left: (dynamic?.left ?? base?.left ?? 0) * remRatio,
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

	export const MARGIN_WRAPPER_PROPS = [
		"Size",
		"Position",
		"AnchorPoint",
		"LayoutOrder",
		"ZIndex",
		"Visible",
	] as const;

	export function isMarginWrapperProp(name: string): boolean {
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
	export function prepareMarginWrapper(
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

		const declaredSize = wrapperProps.Size;
		const automaticSize = hostProps.AutomaticSize;
		if (typeIs(declaredSize, "UDim2")) {
			wrapperProps.Size = new UDim2(
				declaredSize.X.Scale,
				declaredSize.X.Offset + margin.left + margin.right,
				declaredSize.Y.Scale,
				declaredSize.Y.Offset + margin.top + margin.bottom,
			);
			hostProps.Size = UDim2.fromScale(1, 1);
		} else if (automaticSize !== undefined) {
			// Content-sized element: the wrapper grows with it, padding included.
			wrapperProps.AutomaticSize = automaticSize;
		} else {
			wrapperProps.AutomaticSize = Enum.AutomaticSize.XY;
		}

		return wrapperProps;
	}
}
