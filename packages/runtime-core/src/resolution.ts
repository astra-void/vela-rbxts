import { __VelaApply } from "./apply";
import { __VelaDivide } from "./divide";
import { __VelaLua } from "./lua";
import { __VelaMargin } from "./margin";
import { __VelaMotion } from "./motion";
import { __VelaOpacity } from "./opacity";
import { __VelaRem } from "./rem";
import { __VelaScope } from "./scope";
import { __VelaToken } from "./token";
import type {
	ClassValue,
	RuntimeEnvironment,
	RuntimeResolution,
	RuntimeResolvedEffectBundle,
	RuntimeResolvedPropEntry,
	RuntimeRule,
	RuntimeScopeNeeds,
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

		// Rules and class tokens apply by rank, then in the order they came, so a
		// matching variant beats the base and a wider breakpoint a narrower one
		// wherever either was written.
		const ranked: RankedEntry[] = [];
		let sorted = true;
		const rank = (entry: RankedEntry) => {
			const previous = ranked[ranked.size() - 1];
			if (previous !== undefined && previous.rank > entry.rank) {
				sorted = false;
			}
			ranked.push(entry);
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
				rank({
					rank: __VelaVariant.conditionPrecedence(rule.condition),
					order: ranked.size(),
					rule,
				});
			}
		}

		for (const token of expandClassValue(theme, className)) {
			const segments = __VelaVariant.splitVariantSegments(token);
			segments.pop();
			rank({
				rank: __VelaVariant.segmentsPrecedence(segments, theme),
				order: ranked.size(),
				token,
			});
		}

		if (!sorted) {
			table.sort(
				ranked,
				(left, right) =>
					left.rank < right.rank ||
					(left.rank === right.rank && left.order < right.order),
			);
		}
		for (const entry of ranked) {
			if (entry.rule !== undefined) {
				__VelaApply.applyEffectBundle(resolution, entry.rule.effects);
			} else if (entry.token !== undefined) {
				applyToken(theme, environment, tag, entry.token, resolution, preflight);
			}
		}
		__VelaApply.dropGridListPadding(resolution);

		// A component hands its alpha to whatever it renders instead.
		const ownAlpha = resolution.opacityAlpha ?? resolution.channelAlpha;
		if (tag !== undefined && ownAlpha !== undefined) {
			composeOwnOpacity(resolution, tag, ownAlpha, preflight);
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
				expandClassValue(theme, className),
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

	/// The group and peer markers this element's `group-*`/`peer-*` read, the
	/// twin of `attributeNames`: an element that names none watches nothing.
	export function scopeNeeds(
		theme: RuntimeTheme,
		runtimeRules: readonly RuntimeRule[],
		className: ClassValue | undefined,
	): RuntimeScopeNeeds {
		const groups = new Set<string>();
		const peers = new Set<string>();

		for (const rule of runtimeRules) {
			__VelaVariant.collectConditionScopes(rule.condition, groups, peers);
		}

		if (className !== undefined) {
			__VelaVariant.collectClassValueScopes(
				expandClassValue(theme, className),
				theme,
				groups,
				peers,
			);
		}

		return { groups: sortedNames(groups), peers: sortedNames(peers) };
	}

	function sortedNames(names: Set<string>): string[] {
		const sorted: string[] = [];
		for (const name of names) {
			sorted.push(name);
		}
		table.sort(sorted);

		return sorted;
	}

	interface RankedEntry {
		rank: number;
		order: number;
		rule?: RuntimeRule;
		token?: string;
	}

	/// A plugin utility that reaches itself would expand forever; the class is
	/// dropped instead, matching what the static path does.
	export const MAX_PLUGIN_EXPANSION_DEPTH = 8;

	/// A plugin body can carry variants, so anything that scans prefixes reads it spelled out.
	function expandClassValue(
		theme: RuntimeTheme,
		className: ClassValue | undefined,
	): string[] {
		const tokens: string[] = [];
		for (const token of __VelaApply.normalizeClassValue(className)) {
			expandToken(theme, token, tokens, 0);
		}

		return tokens;
	}

	/// Spells a plugin utility out into the classes it stands for, each under
	/// the prefixes it was written with, so every one of them is ranked as itself.
	function expandToken(
		theme: RuntimeTheme,
		token: string,
		into: string[],
		depth: number,
	) {
		const segments = __VelaVariant.splitVariantSegments(token);
		const utility = segments.pop();
		const pluginUtility =
			utility === undefined ? undefined : theme.pluginUtilities[utility];
		if (utility === undefined || !typeIs(pluginUtility, "string")) {
			into.push(token);
			return;
		}
		if (depth >= MAX_PLUGIN_EXPANSION_DEPTH) {
			return;
		}

		const prefix = __VelaLua.substring(
			token,
			0,
			__VelaLua.stringLength(token) - __VelaLua.stringLength(utility),
		);
		for (const part of __VelaLua.splitWhitespace(pluginUtility)) {
			expandToken(theme, `${prefix}${part}`, into, depth + 1);
		}
	}

	export function applyToken(
		theme: RuntimeTheme,
		environment: RuntimeEnvironment,
		tag: string | undefined,
		token: string,
		resolution: RuntimeResolution,
		preflight: boolean,
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

		// A marker is an unconditional tag; under a variant it is dropped, as the
		// compiler drops it.
		const marker = __VelaScope.markerTag(utility);
		if (marker !== undefined) {
			if (segments.size() === 0 && tag !== undefined) {
				const markers = resolution.markers ?? [];
				if (!markers.includes(marker)) {
					markers.push(marker);
				}
				resolution.markers = markers;
			}
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
		if (pluginUtility !== undefined && !typeIs(pluginUtility, "string")) {
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
			withPreflightBackground(
				withColorOpacityReset(effect, resolution),
				preflight,
			),
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
			if (
				helper.tag !== "uistroke" &&
				helper.tag !== "uiblur" &&
				!__VelaApply.isShadowHelper(helper.tag)
			) {
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

	/// Mirrors `compose_inherited_opacity` over the element's own `opacity-*`: a
	/// channel nothing set still paints, so it fades from opaque. A background
	/// preflight neutralized stays transparent, which no alpha changes.
	function composeOwnOpacity(
		resolution: RuntimeResolution,
		tag: string,
		alpha: number,
		preflight: boolean,
	) {
		for (const name of __VelaOpacity.transparencyProps(tag)) {
			if (resolution.props[name] !== undefined) {
				continue;
			}
			if (
				preflight &&
				name === "BackgroundTransparency" &&
				!paintsBackground(resolution)
			) {
				continue;
			}
			resolution.props[name] = 0;
		}

		composeInheritedOpacity(resolution, tag, alpha);
	}

	function paintsBackground(resolution: RuntimeResolution): boolean {
		return (
			resolution.props.BackgroundColor3 !== undefined ||
			resolution.gradientFrom !== undefined ||
			resolution.gradientVia !== undefined ||
			resolution.gradientTo !== undefined
		);
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

	const COLOR_TRANSPARENCY_PROPS: Record<string, string> = {
		BackgroundColor3: "BackgroundTransparency",
		TextColor3: "TextTransparency",
		ImageColor3: "ImageTransparency",
		ScrollBarImageColor3: "ScrollBarImageTransparency",
	};

	/// Mirrors `apply_color_utility`: a solid color takes back the `/N` an earlier
	/// token left on its channel.
	function withColorOpacityReset(
		effect: RuntimeResolvedEffectBundle,
		resolution: RuntimeResolution,
	): RuntimeResolvedEffectBundle {
		let props: RuntimeResolvedPropEntry[] | undefined;
		for (const prop of effect.props) {
			const transparency = COLOR_TRANSPARENCY_PROPS[prop.name];
			if (
				transparency === undefined ||
				resolution.props[transparency] === undefined ||
				effect.props.some((entry) => entry.name === transparency)
			) {
				continue;
			}

			props = props ?? [...effect.props];
			props.push({ name: transparency, value: 0 });
		}

		return props === undefined ? effect : { props, helpers: effect.helpers };
	}
}
