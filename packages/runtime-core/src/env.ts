import {
	Players as __VelaPlayers,
	UserInputService as __VelaUserInputService,
	Workspace as __VelaWorkspace,
} from "@rbxts/services";
import __VelaConfigDefaults from "./config-defaults.json";
import { __VelaRem } from "./rem";
import type {
	RuntimeCamera,
	RuntimeColorEntry,
	RuntimeColorScale,
	RuntimeEnvironment,
	RuntimeTheme,
	VelaRuntimeConfig,
} from "./types";
import { __VelaValue } from "./value";

export namespace __VelaEnv {
	export function readRuntimeEnvironment(
		camera: RuntimeCamera | undefined,
	): RuntimeEnvironment {
		const viewportSize = camera?.ViewportSize;
		const width = viewportSize?.X ?? 0;
		const height = viewportSize?.Y ?? 0;

		return {
			width,
			rem: __VelaRem.resolve(camera),
			orientation: width >= height ? "landscape" : "portrait",
			input: detectInputMode(),
			colorScheme: readColorScheme(),
			hovered: false,
			pressed: false,
			focused: false,
		};
	}

	/// A drag walks the viewport through every intermediate size, and each step
	/// would re-resolve the rem curve and rewrite every offset hanging off it.
	const VIEWPORT_DEBOUNCE = 0.2;

	export type DebouncedRefresh = {
		call: () => void;
		cancel: () => void;
	};

	/// A lone change stays instant — the leading edge runs it — and a storm
	/// collapses into one more call once the viewport settles.
	export function debounceViewport(refresh: () => void): DebouncedRefresh {
		let timer: thread | undefined;
		let queued = false;

		function expire() {
			timer = undefined;

			if (queued) {
				queued = false;
				refresh();
			}
		}

		return {
			call: () => {
				if (timer === undefined) {
					refresh();
				} else {
					task.cancel(timer);
					queued = true;
				}

				timer = task.delay(VIEWPORT_DEBOUNCE, expire);
			},
			cancel: () => {
				if (timer !== undefined) {
					task.cancel(timer);
					timer = undefined;
				}

				queued = false;
			},
		};
	}

	/// The viewport is read off the current camera, which the place can swap: the
	/// size subscription has to follow it rather than stay on the one that was
	/// current at connect time.
	export function watchViewport(onChange: () => void): void {
		let cameraConnection: RBXScriptConnection | undefined;

		function watchCamera() {
			cameraConnection?.Disconnect();

			const camera = __VelaWorkspace.CurrentCamera;
			cameraConnection =
				camera === undefined
					? undefined
					: camera.GetPropertyChangedSignal("ViewportSize").Connect(onChange);
		}

		__VelaWorkspace.GetPropertyChangedSignal("CurrentCamera").Connect(() => {
			watchCamera();
			onChange();
		});
		watchCamera();
	}

	/// Roblox exposes no color scheme to a running game, so the app owns the
	/// choice: `dark:` reads this attribute off the local player, which the server
	/// can also set per player.
	export const VELA_COLOR_SCHEME_ATTRIBUTE = "VelaColorScheme";

	function readColorScheme(): RuntimeEnvironment["colorScheme"] {
		const player = __VelaPlayers.LocalPlayer;
		if (player === undefined) {
			return "light";
		}

		return player.GetAttribute(VELA_COLOR_SCHEME_ATTRIBUTE) === "dark"
			? "dark"
			: "light";
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

	/// The defaults every project starts from. They live here rather than in
	/// each emitted module because they are the same table in every one of them
	/// — and they are most of what a theme weighs.
	const DEFAULT_THEME = __VelaConfigDefaults.theme as unknown as {
		colors: Record<string, string | Record<string, string>>;
		radius: Record<string, string>;
		spacing: Record<string, string>;
		fontFamily: Record<string, string>;
		screens: Record<string, number>;
	};

	function withDefaults<T>(
		defaults: Record<string, T>,
		overrides: Record<string, T>,
		replaced: boolean,
	): Record<string, T> {
		if (replaced) {
			return overrides;
		}

		const merged: Record<string, T> = {};

		for (const [key, value] of pairs(defaults)) {
			merged[key as string] = value as T;
		}
		for (const [key, value] of pairs(overrides)) {
			merged[key as string] = value as T;
		}

		return merged;
	}

	export function normalizeTheme(config: VelaRuntimeConfig): RuntimeTheme {
		const replaced = config.theme.replaced ?? [];
		const isReplaced = (name: string) =>
			replaced.some((entry) => entry === name);

		return {
			colors: normalizeColorRegistry(
				withDefaults(
					DEFAULT_THEME.colors,
					config.theme.colors,
					isReplaced("colors"),
				),
			),
			radius: normalizeUDimScale(
				withDefaults(
					DEFAULT_THEME.radius,
					config.theme.radius,
					isReplaced("radius"),
				),
			),
			spacing: normalizeUDimScale(
				withDefaults(
					DEFAULT_THEME.spacing,
					config.theme.spacing,
					isReplaced("spacing"),
				),
			),
			fontFamily: withDefaults(
				DEFAULT_THEME.fontFamily,
				config.theme.fontFamily,
				isReplaced("fontFamily"),
			),
			screens: withDefaults(
				DEFAULT_THEME.screens,
				config.theme.screens ?? {},
				isReplaced("screens"),
			),
			pluginUtilities: config.plugins?.utilities ?? {},
			pluginVariants: config.plugins?.variants ?? {},
		};
	}

	export function normalizeColorRegistry(
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

	export function normalizeColorScale(
		scale: Record<string, string>,
	): RuntimeColorScale {
		const normalized: RuntimeColorScale = {};

		for (const [key, entry] of pairs(scale)) {
			const value = __VelaValue.parseColor3(entry);
			if (value !== undefined) {
				normalized[key] = value;
			}
		}

		return normalized;
	}

	function normalizeUDimScale(
		scale: Record<string, string>,
	): Record<string, UDim> {
		const normalized: Record<string, UDim> = {};

		for (const [key, value] of pairs(scale)) {
			normalized[key] =
				__VelaValue.parseUDim(value as string) ?? new UDim(0, 0);
		}

		return normalized;
	}
}
