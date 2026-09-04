import { __VelaApply } from "./apply";
import { __VelaDivide } from "./divide";
import { __VelaLua } from "./lua";
import { __VelaMargin } from "./margin";
import { __VelaMotion } from "./motion";
import { __VelaOpacity } from "./opacity";
import { __VelaRem } from "./rem";
import { __VelaToken } from "./token";
import type {
	ClassValue,
	RuntimeEnvironment,
	RuntimeResolution,
	RuntimeResolvedEffectBundle,
	RuntimeRule,
	RuntimeTheme,
} from "./types";
import { __VelaVariant } from "./variant";

export namespace __VelaResolution {
	export function resolveRuntimeResolution(
		theme: RuntimeTheme,
		environment: RuntimeEnvironment,
		runtimeRules: readonly RuntimeRule[],
		className: ClassValue | undefined,
		preflight: boolean,
		tag: string | undefined,
	): RuntimeResolution {
		const resolution: RuntimeResolution = {
			props: {},
			helpers: [],
			remRatio: __VelaRem.ratio(environment.rem),
		};

		for (const rule of runtimeRules) {
			if (__VelaVariant.conditionUsesState(rule.condition, "hover")) {
				resolution.usesHover = true;
			}
			if (__VelaVariant.conditionUsesState(rule.condition, "active")) {
				resolution.usesActive = true;
			}
			if (__VelaVariant.conditionUsesState(rule.condition, "focus")) {
				resolution.usesFocus = true;
			}
			if (__VelaVariant.matchesRuntimeCondition(rule.condition, environment)) {
				__VelaApply.applyEffectBundle(resolution, rule.effects);
			}
		}

		for (const token of __VelaApply.normalizeClassValue(className)) {
			applyToken(theme, environment, tag, token, resolution, preflight, 0);
		}

		return resolution;
	}

	/// Every Roblox attribute this element's styling reads, from the rules it was
	/// built with and from whatever class value it was handed. This is the whole
	/// subscription set: an element that names no attribute variant gets an
	/// empty list, and so connects nothing.
	export function attributeNames(
		theme: RuntimeTheme,
		runtimeRules: readonly RuntimeRule[],
		className: ClassValue | undefined,
	): string[] {
		const names = new Set<string>();

		for (const rule of runtimeRules) {
			__VelaVariant.collectConditionAttributes(rule.condition, names);
		}

		if (className !== undefined) {
			__VelaVariant.collectClassValueAttributes(
				__VelaApply.normalizeClassValue(className),
				theme,
				names,
			);
		}

		// Sorted so a host can compare two readings for equality without caring
		// which order the classes happened to name them in.
		const sorted: string[] = [];
		for (const name of names) {
			sorted.push(name);
		}
		table.sort(sorted);

		return sorted;
	}

	/// A plugin utility that reaches itself would expand forever; the class is
	/// dropped instead, matching what the static path does.
	export const MAX_PLUGIN_EXPANSION_DEPTH = 8;

	export function applyToken(
		theme: RuntimeTheme,
		environment: RuntimeEnvironment,
		tag: string | undefined,
		token: string,
		resolution: RuntimeResolution,
		preflight: boolean,
		depth: number,
	) {
		if (!token) {
			return;
		}

		// Split the way the compiler's tokenizer splits, so a `:` inside an
		// arbitrary value stays part of it.
		const segments = __VelaVariant.splitVariantSegments(token);
		const utility = segments.pop();
		if (!utility) {
			return;
		}

		if (segments.includes("hover")) {
			resolution.usesHover = true;
		}
		if (segments.includes("active")) {
			resolution.usesActive = true;
		}
		if (segments.includes("focus")) {
			resolution.usesFocus = true;
		}

		if (
			!segments.every((segment) =>
				__VelaVariant.matchesVariant(segment, environment, theme),
			)
		) {
			return;
		}

		const pluginUtility = theme.pluginUtilities[utility];
		if (pluginUtility !== undefined) {
			if (depth >= MAX_PLUGIN_EXPANSION_DEPTH) {
				return;
			}

			if (typeIs(pluginUtility, "string")) {
				const prefix = __VelaLua.substring(
					token,
					0,
					__VelaLua.stringLength(token) - __VelaLua.stringLength(utility),
				);
				for (const part of __VelaLua.splitWhitespace(pluginUtility)) {
					applyToken(
						theme,
						environment,
						tag,
						`${prefix}${part}`,
						resolution,
						preflight,
						depth + 1,
					);
				}
				return;
			}

			for (const [name, value] of pairs(pluginUtility)) {
				__VelaApply.setProp(
					resolution.props,
					name as string,
					__VelaApply.parseRuntimePropValue(value as string),
				);
			}
			return;
		}

		if (__VelaDivide.applyDivideToken(theme, utility, resolution)) {
			return;
		}

		if (__VelaMargin.applyMarginToken(theme, utility, resolution)) {
			return;
		}

		if (utility === "uppercase") {
			resolution.textTransform = "upper";
			return;
		}
		if (utility === "lowercase") {
			resolution.textTransform = "lower";
			return;
		}
		if (utility === "capitalize") {
			resolution.textTransform = "capitalize";
			return;
		}
		if (utility === "normal-case") {
			resolution.textTransform = "none";
			return;
		}
		if (utility === "underline") {
			resolution.textDecoration = "underline";
			return;
		}
		if (utility === "line-through") {
			resolution.textDecoration = "strike";
			return;
		}
		if (utility === "no-underline") {
			resolution.textDecoration = "none";
			return;
		}

		if (__VelaLua.startsWith(utility, "animate-")) {
			const key = __VelaLua.after(utility, "animate-");
			if (
				key === "spin" ||
				key === "pulse" ||
				key === "bounce" ||
				key === "none"
			) {
				resolution.animation = key;
			}
			return;
		}

		if (__VelaMotion.applyTransitionToken(utility, resolution)) {
			return;
		}

		const effect = __VelaToken.resolveUtilityToken(theme, tag, utility);
		if (!effect) {
			return;
		}

		// A utility the host element cannot carry is dropped whole, the way the
		// static path drops it: writing `TextColor3` onto a Frame is a hard Roblox
		// error, not a no-op.
		if (!effect.props.every((prop) => isPropAllowedOnTag(tag, prop.name))) {
			return;
		}

		__VelaApply.applyResolvedEffectBundle(
			resolution,
			withPreflightBackground(effect, preflight),
		);
	}

	const TEXT_HOST_PROPS: readonly string[] = [
		"TextColor3",
		"TextTransparency",
		"TextSize",
		"TextXAlignment",
		"TextYAlignment",
		"TextWrapped",
		"TextTruncate",
		"LineHeight",
		"FontFamily",
		"FontWeight",
		"FontStyle",
	];

	const IMAGE_HOST_PROPS: readonly string[] = [
		"ImageColor3",
		"ImageTransparency",
		"ScaleType",
	];

	const SCROLL_HOST_PROPS: readonly string[] = [
		"ElasticBehavior",
		"ScrollingDirection",
		"ScrollingEnabled",
		"ScrollBarThickness",
		"ScrollBarImageColor3",
		"ScrollBarImageTransparency",
		"AutomaticCanvasSize",
	];

	/// Roblox has no inherited transparency, so an enclosing `opacity-*` hands this
	/// element the alpha it has left and every channel below carries the product.
	/// Only what the runtime itself resolved passes through here — the statically
	/// known half was already composed by the transformer.
	export function composeInheritedOpacity(
		resolution: RuntimeResolution,
		tag: string | undefined,
		alpha: number,
	) {
		for (const name of __VelaOpacity.transparencyProps(tag)) {
			const current = resolution.props[name];
			if (current === undefined) {
				continue;
			}
			resolution.props[name] = __VelaOpacity.compose(current as number, alpha);
		}

		for (const helper of resolution.helpers) {
			if (helper.tag !== "uistroke" && helper.tag !== "uishadow") {
				continue;
			}

			const transparency = helper.props.find(
				(prop) => prop.name === "Transparency",
			);
			if (transparency === undefined) {
				helper.props.push({ name: "Transparency", value: 1 - alpha });
				continue;
			}
			transparency.value = 1 - (1 - (transparency.value as number)) * alpha;
		}
	}

	/// Mirrors `is_utility_allowed_on_host`. A component element hides its host tag,
	/// so nothing is filtered there — same as the static path's `None`.
	export function isPropAllowedOnTag(
		tag: string | undefined,
		name: string,
	): boolean {
		if (tag === undefined) {
			return true;
		}

		if (TEXT_HOST_PROPS.includes(name)) {
			return tag === "textlabel" || tag === "textbutton" || tag === "textbox";
		}

		if (IMAGE_HOST_PROPS.includes(name)) {
			return tag === "imagelabel" || tag === "imagebutton";
		}

		if (name === "PlaceholderColor3") {
			return tag === "textbox";
		}

		if (SCROLL_HOST_PROPS.includes(name)) {
			return tag === "scrollingframe";
		}

		return true;
	}

	/// Preflight leaves the base transparent, so a background color resolved from a
	/// dynamic class value has to state its own opacity or it would never show.
	export function withPreflightBackground(
		effect: RuntimeResolvedEffectBundle,
		preflight: boolean,
	): RuntimeResolvedEffectBundle {
		if (!preflight) {
			return effect;
		}

		let setsColor = false;
		for (const prop of effect.props) {
			if (prop.name === "BackgroundTransparency") {
				return effect;
			}
			if (prop.name === "BackgroundColor3") {
				setsColor = true;
			}
		}

		if (!setsColor) {
			return effect;
		}

		const props = [...effect.props];
		props.push({ name: "BackgroundTransparency", value: 0 });
		return { props, helpers: effect.helpers };
	}
}
