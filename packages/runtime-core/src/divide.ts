import { __VelaColor } from "./color";
import { __VelaLua } from "./lua";
import { __VelaOpacity } from "./opacity";
import type {
	RuntimeDivide,
	RuntimeDividePlan,
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
				state.transparency =
					opacity === undefined
						? undefined
						: __VelaValue.opacityToTransparency(opacity);
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

	/// `alpha` is the static fade the transformer composed into `base`. A
	/// transparency only the class value names never met it, so it is composed
	/// here instead.
	export function resolveDivideConfig(
		base: RuntimeDivide | undefined,
		dynamic: RuntimeDivideState | undefined,
		remRatio: number,
		alpha?: number,
	): RuntimeDivide | undefined {
		const axis = dynamic?.axis ?? base?.axis;
		if (axis === undefined) {
			return undefined;
		}

		// CSS draws no border at zero width, and a zero-size separator would
		// still take the gap twice.
		const thickness = dynamic?.thickness ?? base?.thickness ?? 1;
		if (thickness === 0) {
			return undefined;
		}

		let transparency = dynamic?.transparency ?? base?.transparency;
		if (
			alpha !== undefined &&
			alpha < 1 &&
			(dynamic?.transparency !== undefined || base === undefined)
		) {
			transparency = __VelaOpacity.compose(transparency ?? 0, alpha);
		}

		return {
			axis,
			thickness: thickness * remRatio,
			color: dynamic?.color ?? base?.color,
			transparency,
		};
	}

	/// What a separator paints at under the fade its host hands its children.
	export function separatorTransparency(
		divide: RuntimeDivide | undefined,
		alpha: number,
	): number {
		return __VelaOpacity.compose(divide?.transparency ?? 0, alpha);
	}

	/// Ranks the content children by their declared `LayoutOrder`, ties kept in
	/// source order, and slots a separator between each pair of neighbours.
	/// Ranks are always assigned: equal orders would otherwise fall back to the
	/// engine's tie-break, which follows instance creation rather than the JSX.
	export function planDivideOrder(
		orders: readonly number[],
	): RuntimeDividePlan {
		const count = orders.size();
		const ranked: number[] = [];
		for (let index = 0; index < count; index += 1) {
			ranked.push(index);
		}
		// `table.sort` is not stable, so the source index settles a tie.
		table.sort(ranked, (left, right) => {
			const leftOrder = orders[left] ?? 0;
			const rightOrder = orders[right] ?? 0;
			return leftOrder !== rightOrder ? leftOrder < rightOrder : left < right;
		});

		const child = table.create<number>(count, 0);
		const separator: number[] = [];
		ranked.forEach((index, rank) => {
			child[index] = 2 * rank;
			if (rank > 0) {
				separator.push(2 * rank - 1);
			}
		});

		return { child, separator };
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
