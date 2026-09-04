import { Workspace as __VelaWorkspace } from "@rbxts/services";
import type {
	ClassValue,
	RuntimeCamera,
	RuntimeDivide,
	RuntimeEnvironment,
	RuntimeMargin,
	RuntimePropValue,
	RuntimeRemConfig,
	RuntimeResolution,
	RuntimeRule,
	RuntimeTextSpec,
	RuntimeTheme,
	RuntimeTransition,
	VariantEventBinding,
	VelaMotionDriver,
	VelaRuntimeConfig,
	VelaRuntimeTag,
} from "@rbxts/vela-runtime-core";
import {
	__VelaApply,
	__VelaDivide,
	__VelaEnv as __VelaEnvCore,
	__VelaMargin,
	__VelaMotion,
	__VelaOpacity as __VelaOpacityCore,
	__VelaRem as __VelaRemCore,
	__VelaResolution,
	__VelaText,
	__VelaVariant,
} from "@rbxts/vela-runtime-core";
import Vide from "@rbxts/vide";

/// `create()` hands its tag straight to `Instance.new()`, so the lowercase tags
/// the transformer writes only resolve through `jsx`, which carries the
/// ReflectionService map — and the `action`/`*Changed` pass-through with it.
/// It is absent from @rbxts/vide's published types.
const videJsx = (
	Vide as unknown as {
		jsx: (tag: string, props: object) => Vide.Node;
	}
).jsx;

type VelaRemScaler = {
	scale: <T>(value: T, slot: number) => () => T;
	scaleText: (value: number, slot: number) => () => number;
};

type VelaRuntimeHostProps = {
	__velaTag: VelaRuntimeTag;
	__velaRules?: readonly RuntimeRule[];
	/// The React host is handed booleans, because a re-render brings the next
	/// ones. Nothing re-runs this component, so each test arrives as a thunk.
	__velaTests?: readonly (() => boolean)[];
	__velaRem?: readonly string[];
	/// Whether a container this pass could see pins those offsets to literal
	/// pixels. What the scope says is the same thing for a pin that was opened
	/// in a file this element's own was compiled without.
	__velaRemPinned?: boolean;
	__velaTransition?: RuntimeTransition;
	__velaAnimation?: string;
	__velaText?: RuntimeTextSpec;
	__velaDivide?: RuntimeDivide;
	__velaMargin?: RuntimeMargin;
	/// A margin the transformer could read but not resolve. The box one needs
	/// goes above an element that is parented as soon as it is built, so it is
	/// built up front wherever one is still possible.
	__velaMarginBox?: boolean;
	__velaOpacity?: number;
	className?: ClassValue | (() => ClassValue);
	children?: Vide.Node;
} & Record<string, unknown>;

/// The host's own props, which the transformer writes onto it and no instance
/// has a member for. Named in one place because a name missing from the static
/// passthrough reaches `Instance` and throws there.
const HOST_OWN_PROPS = new Set<string>([
	"__velaTag",
	"__velaRules",
	"__velaTests",
	"__velaRem",
	"__velaRemPinned",
	"__velaTransition",
	"__velaAnimation",
	"__velaText",
	"__velaDivide",
	"__velaMargin",
	"__velaMarginBox",
	"__velaOpacity",
	"className",
	"children",
]);

type VelaRuntimeHostComponent = (props: VelaRuntimeHostProps) => Vide.Node;

/// One reading of the viewport for the whole place, as a source rather than a
/// per-component subscription: every host derives from it, and Vide only reruns
/// the ones whose resolution actually reads what changed. Rem is a field of it,
/// so the scaler reads the same source rather than keeping a second one.
namespace __VelaEnvSource {
	function read(): RuntimeEnvironment {
		return __VelaEnvCore.readRuntimeEnvironment(
			__VelaWorkspace.CurrentCamera as RuntimeCamera | undefined,
		);
	}

	const state = Vide.source(read());

	function refresh() {
		state(read());
	}

	/// Every consumer re-derives off a set, so a resize goes through the
	/// debounce rather than landing a frame's worth of intermediate sizes.
	const viewport = __VelaEnvCore.debounceViewport(refresh);

	__VelaEnvCore.watchViewport(viewport.call);

	// This module is loaded by the emitted preamble, which only then calls the
	// factory that configures the curve — so the first read above used the
	// default one. Without this the correction would be left to whichever
	// viewport signal happened to fire next.
	__VelaRemCore.whenConfigured(refresh);

	export const current = state as () => RuntimeEnvironment;
}

/// Whether what is being built right now sits under a container that pins its
/// offsets to literal pixels. Declared above the scaler that reads it, since a
/// namespace is a local and a local is not in scope above itself.
namespace __VelaPin {
	const Context = Vide.context(false);

	export function pinned(): boolean {
		return Context();
	}

	export function scope(body: () => Vide.Node): Vide.Node {
		return Context(true, body);
	}
}

namespace __VelaRemSource {
	function ratio(): number {
		return __VelaRemCore.ratio(__VelaEnvSource.current().rem);
	}

	/// No slot table: a thunk costs nothing to rebuild, and React needed one
	/// only because a fresh binding reads as a new subscription.
	///
	/// A pin is read where the thunk is built rather than inside it: a child is
	/// built inside the scope that holds it, and the effect the thunk ends up in
	/// runs long after that scope closed. React has to undo the scaling after
	/// the fact for the same reason it caches; here it is never applied.
	export function scaler(): VelaRemScaler {
		function scale<T>(value: T, _slot: number): () => T {
			if (__VelaPin.pinned()) {
				return () => value;
			}

			return () => __VelaRemCore.apply(value as never, ratio()) as never;
		}

		function scaleText(value: number, _slot: number): () => number {
			if (__VelaPin.pinned()) {
				const capped = math.min(value, __VelaRemCore.TEXT_SIZE_CEILING);

				return () => capped;
			}

			return () => math.min(value * ratio(), __VelaRemCore.TEXT_SIZE_CEILING);
		}

		return { scale, scaleText };
	}
}

/// What a module gets when it scales an offset without needing the host. The
/// curve is configured here rather than at import time because a file can reach
/// rem without ever constructing the host that would otherwise carry the config.
export function createVelaRemScaler(config?: RuntimeRemConfig): VelaRemScaler {
	__VelaRemCore.configure(config);

	return __VelaRemSource.scaler();
}

export namespace __VelaOpacity {
	const Context = Vide.context(1);

	/// Instances a runtime host already read the inherited alpha for. React's
	/// consumer recognizes a host by its element type and leaves it alone; the
	/// element is gone by the time this one runs, so what it built is marked.
	const provided = setmetatable(new Map<Instance, true>(), { __mode: "k" });

	type ProviderProps = { value: number; children: () => Vide.Node };

	/// Multiplied here rather than at the context, where the inner value would
	/// simply win.
	export const Provider = (props: ProviderProps) => {
		const total = Context() * props.value;

		return Context(total, props.children);
	};

	/// The alpha an enclosing fade has left, for a host that resolves against a
	/// tag of its own rather than being faded from the outside.
	export function inherited(): number {
		return Context();
	}

	export function markProvided(instance: Instance) {
		provided.set(instance, true);
	}

	/// A component the runtime host renders runs inside the host's own body, so
	/// this is the one place a real context scope still opens around a subtree
	/// the transformer could not see into.
	export function scope(alpha: number, body: () => Vide.Node): Vide.Node {
		return Context(alpha, body);
	}

	/// React clones the element to fold the inherited alpha in. Vide has already
	/// built the instance by the time this runs, so it is written instead.
	export function consume(children: Vide.Node): Vide.Node {
		const alpha = Context();
		if (alpha < 1) {
			fade(children, alpha, undefined);
		}

		return children;
	}

	/// What React hands a host's children through a provider they read during
	/// their own render. A Vide child is built before its parent, so the alpha
	/// is written onto what it built — and the base it is composed against is
	/// remembered, because an alpha the resolution can still change would
	/// otherwise compound on every reading.
	export function fadeChildren(children: defined[], alpha: () => number) {
		const bases = new Map<Instance, Map<string, number>>();

		Vide.effect(() => {
			const current = alpha();
			for (const child of children) {
				fade(child as Vide.Node, current, bases);
			}
		});
	}

	function fade(
		node: Vide.Node,
		alpha: number,
		bases: Map<Instance, Map<string, number>> | undefined,
	) {
		if (!typeIs(node, "Instance")) {
			return;
		}

		// It resolved this alpha against its own tag already, and provides for
		// whatever it built below.
		if (provided.has(node)) {
			return;
		}

		const tag = node.ClassName.lower();
		const target = node as unknown as Record<string, number>;
		let base = bases?.get(node);
		if (bases !== undefined && base === undefined) {
			base = new Map<string, number>();
			bases.set(node, base);
		}

		for (const name of __VelaOpacityCore.transparencyProps(tag)) {
			let from = base?.get(name);
			if (from === undefined) {
				const current = target[name];
				if (!typeIs(current, "number")) {
					continue;
				}
				from = current;
				base?.set(name, from);
			}

			target[name] = __VelaOpacityCore.compose(from, alpha);
		}

		// A CanvasGroup composites its whole subtree, so the `GroupTransparency`
		// just written already carries the fade for everything below it.
		if (tag === "canvasgroup") {
			return;
		}

		for (const child of node.GetChildren()) {
			fade(child, alpha, bases);
		}
	}
}

/// What reaches an element through the tree rather than through its own class
/// list, and can only be read where the tree is: an enclosing fade, and the pin
/// a container opened over its whole subtree.
export namespace __VelaBoundary {
	type PinProps = {
		children: (() => Vide.Node) | Array<() => Vide.Node>;
	};

	/// Pins everything below to the offsets it was written with. A `SurfaceGui`
	/// gets its pixel space from the part it is drawn on, so the viewport the
	/// rem curve follows says nothing about what happens under one. Its children
	/// arrive as thunks, since Vide would otherwise have built them before the
	/// scope that holds them existed.
	export function Pin(props: PinProps): Vide.Node {
		const children = props.children;

		return __VelaPin.scope(
			typeIs(children, "function")
				? children
				: () => children.map((child) => child()),
		);
	}

	/// A pin needs nothing here: a thunk reads it where it is built, which is
	/// already inside the scope. Only the fade arrives too late for what it
	/// applies to to have read it.
	export function Consume(props: { children?: Vide.Node }): Vide.Node {
		return __VelaOpacity.consume(props.children);
	}
}

export function createVelaRuntimeHost(
	config: VelaRuntimeConfig,
	motionDriver?: VelaMotionDriver,
) {
	if (motionDriver !== undefined) {
		__VelaMotion.setDriver(motionDriver);
	}

	__VelaRemCore.configure(config.theme.rem);

	const theme = __VelaEnvCore.normalizeTheme(config);
	const preflight = config.preflight;

	return (props: VelaRuntimeHostProps): Vide.Node => {
		const tag = props.__velaTag;
		const instanceCapable = typeIs(tag, "string");
		const hostTag = instanceCapable ? (tag as string) : undefined;
		const rules = (props.__velaRules ?? []) as RuntimeRule[];
		const tests = props.__velaTests ?? [];
		const rawClassName = props.className;
		const textSpec = props.__velaText;
		// Two alphas that have gotten different distances. The transformer's has
		// already reached this element's static props and everything below them;
		// the context's crossed a component boundary it could not see through,
		// so it is the only one anything here was handed rather than resolved.
		const explicitAlpha = props.__velaOpacity ?? 1;
		const ambientAlpha = __VelaOpacity.inherited();
		const alpha = explicitAlpha * ambientAlpha;
		// Read here rather than inside the resolution: the scope is open while
		// this body runs, and the derivation reruns long after it closed.
		const pinned = __VelaPin.pinned() || props.__velaRemPinned === true;

		const hovered = Vide.source(false);
		const pressed = Vide.source(false);
		const focused = Vide.source(false);
		// What the styled instance last reported for the attributes this
		// element's styling reads. Empty, and never written to, on an element
		// that names no attribute variant.
		const attributes = Vide.source<Record<string, unknown>>({});

		function environment(): RuntimeEnvironment {
			const base = __VelaEnvSource.current();
			const readTests: boolean[] = [];
			for (const test of tests) {
				readTests.push(test());
			}

			return {
				width: base.width,
				// A pinned subtree resolves at the base, which is the rem a ratio
				// of 1 comes out of: the offsets it writes are the literal ones.
				rem: pinned ? __VelaRemCore.base() : base.rem,
				orientation: base.orientation,
				input: base.input,
				colorScheme: base.colorScheme,
				hovered: hovered(),
				pressed: pressed(),
				focused: focused(),
				attributes: attributes(),
				tests: readTests,
			};
		}

		function className(): ClassValue {
			return typeIs(rawClassName, "function")
				? (rawClassName as () => ClassValue)()
				: (rawClassName as ClassValue);
		}

		const resolution = Vide.derive(() => {
			const current = __VelaResolution.resolveRuntimeResolution(
				theme,
				environment(),
				rules,
				className(),
				preflight,
				hostTag,
			);

			// Composed here rather than in each bound prop's thunk: they all read
			// the one memoized table, and an alpha composed onto it twice fades
			// it twice.
			if (hostTag !== undefined && alpha < 1) {
				__VelaResolution.composeInheritedOpacity(current, hostTag, alpha);
			}

			return current;
		});

		const statics: Record<string, unknown> = {};
		for (const [key, value] of pairs(props as Record<string, unknown>)) {
			const name = key as string;
			if (!HOST_OWN_PROPS.has(name)) {
				statics[name] = value;
			}
		}

		// Which props the resolution can write is fixed by the class list and the
		// rules, both of which are known here. Reading it once untracked is what
		// turns that into the set of names to bind.
		const shape = Vide.untrack(() => resolution());
		const remProps = new Set<string>();
		for (const name of props.__velaRem ?? []) {
			remProps.add(name);
		}

		// A composer fills the axis a rule left out from what the element already
		// declares — `md:w-1/2` beside a static `h-6` — so it has to be handed
		// those props rather than an empty table.
		function declaredProps(
			current: RuntimeResolution,
		): Record<string, unknown> {
			const remRatio = current.remRatio ?? 1;
			const declared: Record<string, unknown> = {};

			for (const [key, value] of pairs(statics)) {
				const name = key as string;
				let raw = value as unknown;
				// A static that is a function is either a value to read now or a
				// handler to connect later, and only the property behind the name
				// tells the two apart: reading a handler as a value calls it.
				if (typeIs(raw, "function")) {
					if (!readsAsValue(hostTag, name)) {
						continue;
					}
					raw = (raw as () => unknown)();
				}
				if (raw === undefined) {
					continue;
				}

				declared[name] =
					remRatio !== 1 && remProps.has(name)
						? __VelaRemCore.apply(raw as RuntimePropValue, remRatio)
						: raw;
			}

			return declared;
		}

		function resolvedProps(
			current: RuntimeResolution,
			declared: Record<string, unknown>,
		): Record<string, unknown> {
			const base: Record<string, unknown> = {};
			for (const [name, value] of pairs(declared)) {
				base[name as string] = value;
			}

			// Props the element was handed rather than resolved — its own static
			// lowering, a spread from the component above it — are what the
			// context's alpha has not reached yet; what this element resolved has
			// already met it in the derive.
			if (hostTag !== undefined && ambientAlpha < 1) {
				for (const name of __VelaOpacityCore.transparencyProps(hostTag)) {
					if (current.props[name] !== undefined) {
						continue;
					}

					const value = base[name];
					base[name] = __VelaOpacityCore.compose(
						typeIs(value, "number") ? value : 0,
						ambientAlpha,
					);
				}
			}

			const composed = composedProps(current, preflight, base);
			__VelaText.applyTextConfig(composed, textSpec, current);

			const textSize = composed.TextSize;
			if (typeIs(textSize, "number")) {
				composed.TextSize = math.min(textSize, __VelaRemCore.TEXT_SIZE_CEILING);
			}

			return composed;
		}

		const transition = instanceCapable
			? __VelaMotion.resolveTransitionConfig(
					props.__velaTransition,
					shape.transition,
				)
			: undefined;
		const marginSpec = __VelaMargin.resolveMarginConfig(
			props.__velaMargin,
			shape.margin,
			shape.remRatio ?? 1,
		);

		const applied: Record<string, unknown> = {};
		for (const [name, value] of pairs(statics)) {
			applied[name as string] = value;
		}

		// A host tag is an instance this host owns, so what the resolution names
		// is written to it as the resolution changes and nothing has to be known
		// up front. A component is handed its props once and decides for itself
		// what to do with them, so those have to be the derivables Vide reads —
		// which is what fixes their names here.
		if (!instanceCapable) {
			for (const name of componentPropNames(
				shape,
				rules,
				preflight,
				remProps,
			)) {
				applied[name] = () => {
					const current = resolution();

					return resolvedProps(current, declaredProps(current))[name];
				};
			}
		}

		if (instanceCapable) {
			// Which states a class list this pass can read names is exact. A
			// deferred one can name a state at any later reading, and a tracker
			// that was never attached is what would keep it from arriving.
			const deferred = typeIs(rawClassName, "function");
			const bindings: VariantEventBinding[] = [];
			if (deferred || shape.usesHover === true) {
				for (const binding of __VelaVariant.hoverTracking(hovered)) {
					bindings.push(binding);
				}
			}
			if (deferred || shape.usesActive === true) {
				for (const binding of __VelaVariant.activeTracking(pressed)) {
					bindings.push(binding);
				}
			}
			if (deferred || shape.usesFocus === true) {
				for (const binding of __VelaVariant.focusTracking(tag, focused)) {
					bindings.push(binding);
				}
			}

			// Vide writes a handler under the property name itself, and composes
			// onto whatever the consumer already put there.
			for (const binding of bindings) {
				const previous = applied[binding.name];
				applied[binding.name] = (...args: unknown[]) => {
					binding.handler(...args);
					if (typeIs(previous, "function")) {
						(previous as (...args: unknown[]) => void)(...args);
					}
				};
			}
		}

		function currentDivide(): RuntimeDivide | undefined {
			const current = resolution();
			return __VelaDivide.resolveDivideConfig(
				props.__velaDivide,
				current.divide,
				current.remRatio ?? 1,
			);
		}

		// Built up front like the helpers are, and for the same reason: a
		// separator is an instance with thunked props, and Vide refuses to open
		// the scope that needs inside the children effect. How many there could
		// ever be is fixed — one fewer than the children that take a layout slot
		// — so the thunk returns the run the resolution currently asks for and
		// Vide unparents the rest.
		const userChildren = flattenChildren(props.children);
		const separators = buildSeparators(
			countContentChildren(userChildren) - 1,
			currentDivide,
		);
		let ownerInstance: Instance | undefined;
		const helpers = helperChildren(
			shape,
			rules,
			resolution,
			transition,
			() => ownerInstance,
		);
		const childList = () => {
			const list: defined[] = [];
			for (const helper of helpers()) {
				list.push(helper);
			}
			for (const child of interleaveDivideSeparators(
				separators,
				userChildren,
				currentDivide(),
			)) {
				list.push(child);
			}

			return list;
		};

		// A host tag takes its children off the array part of the props table.
		// A component reads them off `children`, which is where Vide's own `jsx`
		// puts them.
		if (instanceCapable) {
			(applied as Record<number, unknown>)[1] = childList;
		} else {
			applied.children = childList;
		}

		const margin = () => {
			const current = resolution();
			return __VelaMargin.resolveMarginConfig(
				props.__velaMargin,
				current.margin,
				current.remRatio ?? 1,
			);
		};
		// Wrapped where a margin asked for it, or where the transformer read one
		// it could not resolve. A wrapper the element does not need is one more
		// instance between it and its parent's layout, and this must run before
		// the instance exists either way.
		const marginBox =
			marginSpec !== undefined || props.__velaMarginBox === true;
		const wrapperProps = marginBox ? prepareMarginWrapper(applied) : undefined;

		// What an `opacity-*` this element resolved leaves for its subtree. The
		// transformer's own alpha already reached everything it could see, so
		// only the context's is passed on with it.
		const ownAlpha = Vide.untrack(() => resolution().opacityAlpha ?? 1);

		// A CanvasGroup composites its whole subtree, so the channel this element
		// resolved for itself already carries the fade for everything below it.
		if (
			hostTag !== undefined &&
			hostTag !== "canvasgroup" &&
			ambientAlpha * ownAlpha < 1
		) {
			__VelaOpacity.fadeChildren(userChildren, () => {
				const current = resolution();
				return ambientAlpha * (current.opacityAlpha ?? 1);
			});
		}

		// A component element hides which instance it will render, so its own
		// `opacity-*` and everything it inherited cross into whatever it renders
		// as context and lower there against a tag that is known. Its body runs
		// inside this one, which is what makes the scope reach it at all.
		const subtreeAlpha = alpha * ownAlpha;
		const element = instanceCapable
			? videJsx(hostTag as string, applied)
			: subtreeAlpha < 1
				? __VelaOpacity.scope(subtreeAlpha, () =>
						(tag as (props: never) => Vide.Node)(applied as never),
					)
				: (tag as (props: never) => Vide.Node)(applied as never);

		let wrapper: Instance | undefined;
		let rendered = element;
		if (wrapperProps !== undefined) {
			const padding = videJsx("uipadding", {
				PaddingTop: () => new UDim(0, margin()?.top ?? 0),
				PaddingRight: () => new UDim(0, margin()?.right ?? 0),
				PaddingBottom: () => new UDim(0, margin()?.bottom ?? 0),
				PaddingLeft: () => new UDim(0, margin()?.left ?? 0),
			});

			wrapper = videJsx("frame", {
				...wrapperProps,
				1: padding,
				2: element,
			}) as Instance;
			rendered = wrapper;
		}

		if (typeIs(element, "Instance")) {
			ownerInstance = element;
			__VelaOpacity.markProvided(element);
			watchAttributes(element, theme, rules, className, attributes);
			writeResolvedProps({
				element,
				wrapper,
				hostTag: hostTag as string,
				transition,
				margin,
				warnMargin: !marginBox,
				resolution,
				declaredProps,
				resolvedProps,
			});

			const animation = shape.animation ?? props.__velaAnimation;
			if (animation !== undefined && animation !== "none") {
				const stop = __VelaMotion.startPresetAnimation(element, animation);
				if (stop !== undefined) {
					Vide.cleanup(stop);
				}
			}
		}

		return rendered;
	};
}

type ResolvedPropWriter = {
	element: Instance;
	wrapper: Instance | undefined;
	hostTag: string;
	transition: RuntimeTransition | undefined;
	margin: () => RuntimeMargin | undefined;
	warnMargin: boolean;
	resolution: () => RuntimeResolution;
	declaredProps: (current: RuntimeResolution) => Record<string, unknown>;
	resolvedProps: (
		current: RuntimeResolution,
		declared: Record<string, unknown>,
	) => Record<string, unknown>;
};

/// What a re-render is for React: the resolution is recomputed and whatever it
/// now names is written to the instance. Which props those are never has to be
/// known in advance, which is the whole reason this is one effect rather than a
/// thunk per name.
function writeResolvedProps(writer: ResolvedPropWriter) {
	const element = writer.element;
	const wrapper = writer.wrapper;
	const transition = writer.transition;
	const written = new Map<string, unknown>();
	let warned = false;

	function routed(name: string): boolean {
		return wrapper !== undefined && __VelaMargin.isMarginWrapperProp(name);
	}

	/// The box is the element's own size plus the margin around it, so what is
	/// written depends on both — and reading the margin here is also what makes
	/// the effect follow it.
	function finalValue(name: string, value: unknown): unknown {
		return routed(name) && name === "Size"
			? expandForMargin(value, writer.margin())
			: value;
	}

	function write(name: string, final: unknown, update: boolean) {
		const target = routed(name) ? (wrapper as Instance) : element;

		// The wrapper is the margin box rather than this element, so a tween on
		// it would move a property that is not the element's own.
		if (
			update &&
			transition !== undefined &&
			target === element &&
			__VelaMotion.transitionCoversProp(transition.property, name) &&
			__VelaMotion.isTweenableValue(final)
		) {
			__VelaMotion.playTransition(element, { [name]: final }, transition, {
				owner: element,
			});
			return;
		}

		(target as unknown as Record<string, unknown>)[name] = final;
	}

	Vide.effect(() => {
		const current = writer.resolution();
		const declared = writer.declaredProps(current);
		const composed = writer.resolvedProps(current, declared);

		// A margin cannot arrive after the fact: the box it needs is an instance
		// above this one, and this one is already parented. Loud rather than
		// silently unspaced.
		if (writer.warnMargin && !warned && current.margin !== undefined) {
			warned = true;
			warn(
				`vela: a margin resolved at runtime on <${writer.hostTag}>, after the element was built. ` +
					"Vide cannot add the wrapper it needs — keep `m-*` out of a deferred class value.",
			);
		}

		const stale = new Set<string>();
		for (const [name] of written) {
			stale.add(name as string);
		}

		for (const [key, value] of pairs(composed)) {
			const name = key as string;
			stale.delete(name);

			// A static nothing touched is already on the instance, and Vide binds
			// the derivable ones itself.
			if (!routed(name) && !written.has(name) && declared[name] === value) {
				continue;
			}

			// Compared as written rather than as resolved: a margin that changed
			// moves the box without the element's own size having moved at all.
			const final = finalValue(name, value);
			if (written.get(name) === final) {
				continue;
			}

			write(name, final, written.has(name));
			written.set(name, final);
		}

		// React drops a prop the resolution stopped naming and the reconciler
		// restores it. What the element declared comes back first; the class
		// default answers only where it declared nothing.
		for (const name of stale) {
			const fallback = declared[name] ?? classMember(writer.hostTag, name);
			write(name, finalValue(name, fallback), true);
			written.delete(name);
		}
	});
}

function expandForMargin(
	value: unknown,
	margin: RuntimeMargin | undefined,
): unknown {
	if (!typeIs(value, "UDim2")) {
		return value;
	}

	return new UDim2(
		value.X.Scale,
		value.X.Offset + (margin?.left ?? 0) + (margin?.right ?? 0),
		value.Y.Scale,
		value.Y.Offset + (margin?.top ?? 0) + (margin?.bottom ?? 0),
	);
}

/// What the composers and the Text pipeline read back off the element. A
/// component hides the class a probe would answer against, and none of these is
/// ever an event.
const READ_BACK_PROPS = new Set<string>([
	"AnchorPoint",
	"AutomaticSize",
	"BackgroundTransparency",
	"FontFace",
	"GroupTransparency",
	"ImageTransparency",
	"Position",
	"RichText",
	"Size",
	"Text",
	"TextTransparency",
]);

/// Whether a function under this name is a value to read or a handler to
/// connect. Vide answers that off the instance; here the class answers for it,
/// which also covers `action` and the `*Changed` names — neither is a member.
function readsAsValue(tag: string | undefined, name: string): boolean {
	if (tag === undefined) {
		return READ_BACK_PROPS.has(name);
	}

	const member = classMember(tag, name);

	return member !== undefined && typeOf(member) !== "RBXScriptSignal";
}

/// The names a component has to be handed as derivables, since it is given its
/// props once rather than written to. This is the one place the set still has
/// to be read off a snapshot.
function componentPropNames(
	shape: RuntimeResolution,
	rules: readonly RuntimeRule[],
	preflight: boolean,
	remProps: ReadonlySet<string>,
): Set<string> {
	const names = new Set<string>();

	for (const name of remProps) {
		names.add(name);
	}
	for (const [name] of pairs(shape.props as Record<string, unknown>)) {
		names.add(name as string);
	}
	for (const [name] of pairs(composedProps(shape, preflight, {}))) {
		names.add(name as string);
	}
	for (const rule of rules) {
		for (const entry of rule.effects.props) {
			names.add(COMPOSED_BY_CONTRIBUTOR[entry.name] ?? entry.name);
		}
	}

	return names;
}

/// One unparented instance per class answers both what a property starts out as
/// and whether the name is a property at all. The value a class starts with is
/// the same for every element of it.
const DEFAULT_PROBES = new Map<string, Instance>();

function classMember(tag: string, name: string): unknown {
	let probe = DEFAULT_PROBES.get(tag);
	if (probe === undefined) {
		probe = videJsx(tag, {}) as Instance;
		DEFAULT_PROBES.set(tag, probe);
	}

	const read = probe as unknown as Record<string, unknown>;
	const [ok, value] = pcall(() => read[name]);

	return ok ? value : undefined;
}

function prepareMarginWrapper(
	hostProps: Record<string, unknown>,
): Record<string, unknown> {
	const wrapperProps: Record<string, unknown> = {
		BackgroundTransparency: 1,
		BorderSizePixel: 0,
	};

	// The layout props belong to the margin box. What the resolution names goes
	// there through the writer; these are the ones already on the table, and
	// they have to leave it before the inner instance is built.
	for (const name of __VelaMargin.MARGIN_WRAPPER_PROPS) {
		const value = hostProps[name];
		if (value !== undefined) {
			wrapperProps[name] = value;
			hostProps[name] = undefined;
		}
	}

	const declaredSize = wrapperProps.Size;
	const automaticSize = hostProps.AutomaticSize;
	if (declaredSize !== undefined) {
		// The writer owns it from here, margin expansion included.
		wrapperProps.Size = undefined;
		hostProps.Size = UDim2.fromScale(1, 1);
	} else if (automaticSize !== undefined) {
		wrapperProps.AutomaticSize = automaticSize;
	} else {
		wrapperProps.AutomaticSize = Enum.AutomaticSize.XY;
	}

	return wrapperProps;
}

/// A rule can name an axis rather than a property: `md:w-1/2` writes `SizeX`,
/// which the composers fold into `Size`. Written straight through it would
/// reach the instance, where no such member exists.
const COMPOSED_BY_CONTRIBUTOR: Record<string, string> = {
	SizeX: "Size",
	SizeY: "Size",
	PositionX: "Position",
	PositionY: "Position",
	TranslateX: "Position",
	TranslateY: "Position",
};

/// Every separator a divide could ever ask for, built before the children
/// effect that would otherwise have to open a reactive scope to make one. A run
/// the resolution does not currently ask for is simply left out of the list,
/// and Vide unparents it.
function buildSeparators(
	count: number,
	divide: () => RuntimeDivide | undefined,
): defined[] {
	const separators: defined[] = [];

	for (let index = 0; index < count; index += 1) {
		separators.push(
			videJsx("frame", {
				BackgroundColor3: () => __VelaDivide.separatorColor(divide()),
				BackgroundTransparency: () => divide()?.transparency ?? 0,
				BorderSizePixel: 0,
				Size: () => __VelaDivide.separatorSize(divide()),
			}) as defined,
		);
	}

	return separators;
}

function countContentChildren(children: readonly defined[]): number {
	let count = 0;

	for (const child of children) {
		if (typeIs(child, "Instance") && child.IsA("UIBase")) {
			continue;
		}
		count += 1;
	}

	return count;
}

/// Vide hands a component its children as the node itself, or as a plain array
/// when there is more than one. Interleaving needs them one by one, so the
/// arrays are opened up — but only the plain ones: an action is a table too,
/// and it is the metatable that tells them apart.
function flattenChildren(node: unknown): defined[] {
	const flat: defined[] = [];

	function walk(value: unknown) {
		if (value === undefined) {
			return;
		}
		if (typeIs(value, "table") && getmetatable(value) === undefined) {
			for (const [key, entry] of pairs(value as Record<string, unknown>)) {
				if (typeIs(key, "number")) {
					walk(entry);
				}
			}
			return;
		}
		flat.push(value as defined);
	}

	walk(node);

	return flat;
}

/// Separators go between consecutive children that take a layout slot. A child
/// Vide has already built answers that itself; anything else — a thunk, a
/// binding — is taken at its word and counted as content.
function interleaveDivideSeparators(
	separators: readonly defined[],
	children: readonly defined[],
	divide: RuntimeDivide | undefined,
): defined[] {
	const result: defined[] = [];
	let seenContentChild = false;
	let taken = 0;

	for (const child of children) {
		if (typeIs(child, "Instance") && child.IsA("UIBase")) {
			result.push(child);
			continue;
		}
		if (seenContentChild && divide !== undefined) {
			const between = separators[taken];
			taken += 1;
			if (between !== undefined) {
				result.push(between);
			}
		}
		seenContentChild = true;
		result.push(child);
	}

	return result;
}

function composedProps(
	resolution: RuntimeResolution,
	preflight: boolean,
	declared: Record<string, unknown>,
): Record<string, unknown> {
	const hostProps: Record<string, unknown> = {};
	for (const [name, value] of pairs(declared)) {
		hostProps[name as string] = value;
	}
	for (const [name, value] of pairs(resolution.props)) {
		hostProps[name as string] = value;
	}
	__VelaApply.applyComposedResolution(hostProps, resolution, preflight);

	return hostProps;
}

function helperProps(
	resolution: RuntimeResolution,
	tag: string,
): Record<string, unknown> | undefined {
	__VelaApply.applyHelperDefaults(resolution.helpers);

	for (const helper of resolution.helpers) {
		if (helper.tag === tag) {
			return __VelaApply.helperToProps(helper.props);
		}
	}

	return undefined;
}

/// A helper carries resolved values like any other prop — a `p-4` padding
/// follows rem, and a variant can repaint a stroke. Built from the snapshot
/// alone they would freeze at creation, which for rem means freezing at the
/// 1x1 viewport the first frame has not replaced yet.
///
/// Every tag a rule could ever ask for is built here rather than when the rule
/// first fires, because Vide refuses to open a reactive scope inside one — and
/// a helper built inside the children effect is exactly that. What the returned
/// thunk leaves out, Vide unparents; `hover:rounded-lg` costs one UICorner that
/// spends most of its life detached.
/// Connects to exactly the attributes this element's styling reads, and to
/// nothing when it reads none. The set follows a deferred class value, so a
/// class list that starts naming an attribute is subscribed to as soon as it
/// does and unsubscribed when it stops.
function watchAttributes(
	element: Instance,
	theme: RuntimeTheme,
	rules: readonly RuntimeRule[],
	className: () => ClassValue,
	attributes: Vide.Source<Record<string, unknown>>,
) {
	const connections = new Map<string, RBXScriptConnection>();

	function refresh() {
		const latest: Record<string, unknown> = {};
		let changed = false;
		const previous = Vide.untrack(() => attributes());

		for (const [name] of connections) {
			const value = element.GetAttribute(name);
			latest[name] = value;
			if (previous[name] !== value) {
				changed = true;
			}
		}

		for (const [name] of pairs(previous)) {
			if (!connections.has(name as string)) {
				changed = true;
			}
		}

		if (changed) {
			attributes(latest);
		}
	}

	Vide.effect(() => {
		// Reading the class value here is what makes the set follow it.
		const wanted = __VelaResolution.attributeNames(theme, rules, className());
		const keep = new Set<string>();
		for (const name of wanted) {
			keep.add(name);
		}

		let changed = false;

		for (const [name, connection] of connections) {
			if (!keep.has(name)) {
				connection.Disconnect();
				connections.delete(name);
				changed = true;
			}
		}

		for (const name of wanted) {
			if (!connections.has(name)) {
				connections.set(
					name,
					element.GetAttributeChangedSignal(name).Connect(refresh),
				);
				changed = true;
			}
		}

		// A connection is only told about later changes, so what the element
		// already carries is read here, and only where the set moved, so this
		// effect writes the source once rather than on every rerun.
		if (changed) {
			refresh();
		}
	});

	Vide.cleanup(() => {
		for (const [, connection] of connections) {
			connection.Disconnect();
		}
		connections.clear();
	});
}

function helperChildren(
	shape: RuntimeResolution,
	rules: readonly RuntimeRule[],
	resolution: () => RuntimeResolution,
	transition: RuntimeTransition | undefined,
	owner: () => Instance | undefined,
): () => defined[] {
	__VelaApply.applyHelperDefaults(shape.helpers);

	const tags: string[] = [];
	const instances = new Map<string, defined>();

	function build(tag: string) {
		if (instances.has(tag)) {
			return;
		}

		const child = videJsx(__VelaApply.hostClassName(tag), {});
		if (child === undefined) {
			return;
		}

		// One effect for the whole helper rather than a thunk per prop: which
		// props it carries is a rule's to change, and a name the resolution has
		// dropped must keep its last value rather than be written back as nil.
		//
		// A property that moves under a transition is tweened on the helper
		// itself rather than assigned, so `hover:rounded-xl` travels the same
		// way `hover:bg-*` does. The first writing is always an assignment:
		// there is nothing to tween from yet.
		const written = new Map<string, unknown>();
		Vide.effect(() => {
			const props = helperProps(resolution(), tag);
			if (props === undefined) {
				return;
			}
			for (const [key, value] of pairs(props)) {
				const name = key as string;
				if (written.get(name) === value) {
					continue;
				}

				const seen = written.has(name);
				written.set(name, value);

				if (
					seen &&
					transition !== undefined &&
					__VelaMotion.transitionCoversProp(transition.property, name, tag) &&
					__VelaMotion.isTweenableValue(value)
				) {
					const instance = child as unknown as Instance;
					__VelaMotion.playTransition(
						instance,
						{ [name]: value as RuntimePropValue },
						transition,
						{ owner: owner() ?? instance, helper: tag },
					);
					continue;
				}

				(child as unknown as Record<string, unknown>)[name] = value;
			}
		});

		tags.push(tag);
		instances.set(tag, child as defined);
	}

	for (const helper of shape.helpers) {
		build(helper.tag);
	}
	for (const rule of rules) {
		for (const helper of rule.effects.helpers) {
			build(helper.tag);
		}
	}

	return () => {
		const current = resolution();
		__VelaApply.applyHelperDefaults(current.helpers);

		const present = new Set<string>();
		for (const helper of current.helpers) {
			present.add(helper.tag);
		}

		// Ordered by the tags as they were built, so a helper that comes and goes
		// does not reshuffle its siblings.
		const children: defined[] = [];
		for (const tag of tags) {
			const child = present.has(tag) ? instances.get(tag) : undefined;
			if (child !== undefined) {
				children.push(child);
			}
		}

		return children;
	};
}

export type {
	VelaMotionDriver,
	VelaRemScaler,
	VelaRuntimeConfig,
	VelaRuntimeHostComponent,
};
