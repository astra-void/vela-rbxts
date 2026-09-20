import { __VelaDefaults } from "./defaults";
import { __VelaLua } from "./lua";
import type { RuntimeColorScale, RuntimeTheme } from "./types";
import { __VelaValue } from "./value";

export namespace __VelaColor {
	export function resolveGradientStop(
		theme: RuntimeTheme,
		key: string,
	): [Color3, number | undefined] | undefined {
		const [base, opacity] = __VelaValue.splitColorOpacity(key);
		const color = resolveThemeColor(theme, base)?.color;
		if (color === undefined) {
			return undefined;
		}

		return [
			color,
			opacity === undefined
				? undefined
				: __VelaValue.opacityToTransparency(opacity),
		];
	}

	/// Mirrors `resolve_color_value`: an arbitrary hex, the `transparent` keyword,
	/// or a theme key with an optional shade. `undefined` color means transparent.
	type RuntimeColorValue = {
		color?: Color3;
	};

	export function resolveThemeColor(
		theme: RuntimeTheme,
		key: string,
	): RuntimeColorValue | undefined {
		if (__VelaLua.startsWith(key, "[") && __VelaLua.endsWith(key, "]")) {
			const arbitrary = parseArbitraryColor(key);
			return arbitrary === undefined ? undefined : { color: arbitrary };
		}

		if (key === "current" || key === "inherit") {
			return undefined;
		}

		if (key === "transparent") {
			return {};
		}

		const [colorName, shade] = __VelaValue.splitColorKey(key);
		const value = theme.colors[colorName];
		if (typeIs(value, "string")) {
			if (shade !== undefined) {
				return undefined;
			}

			const parsed = __VelaValue.parseColor3(value);
			return parsed === undefined ? undefined : { color: parsed };
		}

		if (value === undefined) {
			return undefined;
		}

		const entry = (value as RuntimeColorScale)[
			shade ?? __VelaDefaults.PALETTE_DEFAULT_KEY
		];
		return entry === undefined ? undefined : { color: entry };
	}

	export function parseArbitraryColor(key: string): Color3 | undefined {
		const inner = __VelaLua.substring(key, 1, -1);
		if (!__VelaLua.startsWith(inner, "#")) {
			return undefined;
		}

		const hex = __VelaLua.substring(inner, 1);
		if (__VelaLua.stringLength(hex) === 3) {
			const red = parseHexDigit(__VelaLua.substring(hex, 0, 1));
			const green = parseHexDigit(__VelaLua.substring(hex, 1, 2));
			const blue = parseHexDigit(__VelaLua.substring(hex, 2, 3));
			if (red === undefined || green === undefined || blue === undefined) {
				return undefined;
			}

			return Color3.fromRGB(red * 17, green * 17, blue * 17);
		}

		if (__VelaLua.stringLength(hex) === 6) {
			const red = parseHexPair(__VelaLua.substring(hex, 0, 2));
			const green = parseHexPair(__VelaLua.substring(hex, 2, 4));
			const blue = parseHexPair(__VelaLua.substring(hex, 4, 6));
			if (red === undefined || green === undefined || blue === undefined) {
				return undefined;
			}

			return Color3.fromRGB(red, green, blue);
		}

		return undefined;
	}

	const HEX_DIGITS = "0123456789abcdef";

	function parseHexDigit(value: string): number | undefined {
		const lowered = value.lower();
		for (let index = 0; index < 16; index++) {
			if (__VelaLua.substring(HEX_DIGITS, index, index + 1) === lowered) {
				return index;
			}
		}

		return undefined;
	}

	function parseHexPair(value: string): number | undefined {
		const high = parseHexDigit(__VelaLua.substring(value, 0, 1));
		const low = parseHexDigit(__VelaLua.substring(value, 1, 2));
		if (high === undefined || low === undefined) {
			return undefined;
		}

		return high * 16 + low;
	}
}
