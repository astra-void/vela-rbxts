import { __VelaColor } from "./color";
import { __VelaLua } from "./lua";
import type {
	RuntimeDivide,
	RuntimeDivideState,
	RuntimeResolution,
	RuntimeTheme,
} from "./types";
import { __VelaValue } from "./value";

export namespace __VelaDivide {
	function divideState(resolution: RuntimeResolution): RuntimeDivideState {
		let state = resolution.divide;
		if (state === undefined) {
			state = {};
			resolution.divide = state;
		}
		return state;
	}

	/// Consumes `divide-*` tokens from dynamic class values.
	export function applyDivideToken(
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
			if (!__VelaLua.startsWith(token, prefix)) {
				continue;
			}
			const thickness = tonumber(__VelaLua.after(token, prefix));
			if (thickness !== undefined) {
				const state = divideState(resolution);
				state.axis = prefix === "divide-x-" ? "x" : "y";
				state.thickness = thickness;
			}
			return true;
		}

		if (__VelaLua.startsWith(token, "divide-")) {
			const key = __VelaLua.after(token, "divide-");
			const [base, opacity] = __VelaValue.splitColorOpacity(key);
			const color = resolveDivideColor(theme, base);
			if (color !== undefined) {
				const state = divideState(resolution);
				state.color = color;
				if (opacity !== undefined) {
					state.transparency = __VelaValue.opacityToTransparency(opacity);
				}
			}
			return true;
		}

		return false;
	}

	/// The divide config travels as an expression string, because the compile-time
	/// half of it arrives that way on `__velaDivide`.
	function resolveDivideColor(
		theme: RuntimeTheme,
		key: string,
	): string | undefined {
		const color = __VelaColor.resolveThemeColor(theme, key)?.color;
		if (color === undefined) {
			return undefined;
		}

		return `Color3.fromRGB(${math.floor(color.R * 255 + 0.5)}, ${math.floor(color.G * 255 + 0.5)}, ${math.floor(color.B * 255 + 0.5)})`;
	}

	export function resolveDivideConfig(
		base: RuntimeDivide | undefined,
		dynamic: RuntimeDivideState | undefined,
		remRatio: number,
	): RuntimeDivide | undefined {
		const axis = dynamic?.axis ?? base?.axis;
		if (axis === undefined) {
			return undefined;
		}

		return {
			axis,
			thickness: (dynamic?.thickness ?? base?.thickness ?? 1) * remRatio,
			color: dynamic?.color ?? base?.color,
			transparency: dynamic?.transparency ?? base?.transparency,
		};
	}

	export function separatorColor(divide: RuntimeDivide | undefined): Color3 {
		return (
			(divide?.color !== undefined
				? __VelaValue.parseColor3(divide.color)
				: undefined) ?? Color3.fromRGB(229, 231, 235)
		);
	}

	export function separatorSize(divide: RuntimeDivide | undefined): UDim2 {
		if (divide === undefined) {
			return UDim2.fromOffset(0, 0);
		}

		return divide.axis === "x"
			? new UDim2(0, divide.thickness, 1, 0)
			: new UDim2(1, 0, 0, divide.thickness);
	}
}
