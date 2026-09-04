import __VelaReact from "@rbxts/react";
import {
	Players as __VelaPlayers,
	UserInputService as __VelaUserInputService,
	Workspace as __VelaWorkspace,
} from "@rbxts/services";
import type {
	ClassValue,
	RuntimeCamera,
	RuntimeDivide,
	RuntimeEnvironment,
	RuntimeMargin,
	RuntimePropMap,
	RuntimePropValue,
	RuntimeRemConfig,
	RuntimeRule,
	RuntimeTextSpec,
	RuntimeTransition,
	SupportedHostElements,
	SupportedHostElementTag,
	VelaMotionDriver,
	VelaRuntimeConfig,
	VelaRuntimeTag,
} from "@rbxts/vela-runtime-core";
import {
	__VelaApply,
	__VelaDivide as __VelaDivideCore,
	__VelaEnv as __VelaEnvCore,
	__VelaLua,
	__VelaMargin as __VelaMarginCore,
	__VelaMotion,
	__VelaOpacity as __VelaOpacityCore,
	__VelaRem as __VelaRemCore,
	__VelaResolution,
	__VelaText,
	__VelaVariant,
} from "@rbxts/vela-runtime-core";

/// What a module scaling offsets holds instead of the namespace: the slot table
/// the emit numbers from zero, over the one rem curve every module shares.
type VelaRemScaler = {
	scale: <T>(value: T, slot: number) => __VelaReact.Binding<T>;
	scaleText: (value: number, slot: number) => __VelaReact.Binding<number>;
};

// A component element has no instance of its own for a ref to land on.
type VelaRefTarget<Tag> = Tag extends SupportedHostElementTag
	? SupportedHostElements[Tag]
	: unknown;

/// The reactive layer over the shared rem curve. The curve itself, and what it
/// does to a value, is the core's; this is only how a React tree hears about it.
namespace __VelaRem {
	let connected = false;

	const [remBinding, setRem] = __VelaReact.createBinding(
		__VelaRemCore.resolve(undefined),
	);

	/// What each scaled binding was built from. A subtree can turn out to be
	/// pinned only after the element carrying the binding was created: the
	/// `SurfaceGui` is in another file, and the curve was multiplied in long
	/// before the component got there, so the literal it started from is kept
	/// for the consumer that has to put it back. Weak keys: a binding lives as
	/// long as the slot table holding it, and neither outlives the other.
	const literals = setmetatable(new Map<unknown, unknown>(), { __mode: "k" });

	function remember<T>(binding: T, literal: unknown): T {
		literals.set(binding, literal);

		return binding;
	}

	/// One binding per call site in the emit. Rebuilt inline it would be a new
	/// binding on every render, and the reconciler treats a new binding as a
	/// fresh subscription — so the slot the transformer assigned holds it. The
	/// slots belong to the scaler rather than to this namespace: the emit numbers
	/// them from zero in every module, and one shared table would hand a module
	/// the binding its neighbour built.
	export function scaler(): VelaRemScaler {
		const slots: __VelaReact.Binding<unknown>[] = [];

		function cached(
			slot: number,
			build: () => __VelaReact.Binding<unknown>,
		): __VelaReact.Binding<unknown> {
			connect();

			let binding = slots[slot];
			if (binding === undefined) {
				binding = build();
				slots[slot] = binding;
			}

			return binding;
		}

		// The emit hands offsets over as a binding rather than a value: a
		// statically lowered element has no render of its own to run again when
		// the viewport changes, and a binding writes the property without one.
		//
		// Declarations rather than arrows: the compiler reads this file as TSX,
		// where `<T>(…) =>` opens a JSX element instead of a type parameter.
		function scale<T>(value: T, slot: number): __VelaReact.Binding<T> {
			return cached(slot, () =>
				remember(
					remBinding.map(
						(rem) =>
							__VelaRemCore.apply(
								value as never,
								__VelaRemCore.ratio(rem),
							) as never,
					),
					value,
				),
			) as unknown as __VelaReact.Binding<T>;
		}

		function scaleText(
			value: number,
			slot: number,
		): __VelaReact.Binding<number> {
			return cached(slot, () =>
				remember(
					remBinding.map((rem) =>
						math.min(
							value * __VelaRemCore.ratio(rem),
							__VelaRemCore.TEXT_SIZE_CEILING,
						),
					),
					math.min(value, __VelaRemCore.TEXT_SIZE_CEILING),
				),
			) as __VelaReact.Binding<number>;
		}

		return { scale, scaleText };
	}

	function refresh() {
		const latest = __VelaRemCore.resolve(
			__VelaWorkspace.CurrentCamera as RuntimeCamera | undefined,
		);
		if (remBinding.getValue() !== latest) {
			setRem(latest);
		}
	}

	const viewport = __VelaEnvCore.debounceViewport(refresh);

	/// One camera subscription, set up the first time an offset asks for a
	/// binding rather than at module load, so a game that never scales an offset
	/// never listens.
	function connect() {
		if (connected) {
			return;
		}

		connected = true;
		__VelaEnvCore.watchViewport(viewport.call);
		refresh();
	}

	__VelaRemCore.whenConfigured(() => {
		if (connected) {
			refresh();
		}
	});

	/// Hands a subtree back the offsets it was written with. Unlike the fade it
	/// does not stop at a component: putting a literal back is idempotent, so a
	/// consumer that unpins the same subtree again finds nothing left to do,
	/// while stopping would strand whatever the caller built by hand under a
	/// fragment or a wrapper that reads no context of its own.
	export function unpin(node: unknown): unknown {
		if (node === undefined) {
			return node;
		}

		if (__VelaReact.isValidElement(node as object)) {
			return unpinElement(node as __VelaReact.Element);
		}

		if (typeOf(node) !== "table") {
			return node;
		}

		// Children arrive as an array or as a table keyed by instance name, and
		// Roblox names the instance after that key, so the keys have to survive.
		const unpinned = new Map<unknown, unknown>();
		let replaced = false;
		for (const [key, value] of pairs(node as Record<string, unknown>)) {
			const child = unpin(value);
			if (child !== value) {
				replaced = true;
			}
			unpinned.set(key, child);
		}

		return replaced ? unpinned : node;
	}

	function unpinElement(element: __VelaReact.Element): unknown {
		const props = element.props as Record<string, unknown>;
		const replaced: Record<string, unknown> = {};
		let scaled = false;

		// Only a string tag carries scaled props of its own. Everything else —
		// a fragment, a component, a provider — carries only the subtree below.
		if (typeIs(element.type as unknown, "string")) {
			for (const [name, value] of pairs(props)) {
				const literal = literals.get(value);
				if (literal !== undefined) {
					replaced[name as string] = literal;
					scaled = true;
				}
			}
		}

		const children = props.children;
		if (children !== undefined) {
			const unpinned = unpin(children);
			if (unpinned !== children) {
				replaced.children = unpinned;
				scaled = true;
			}
		}

		return scaled
			? __VelaReact.cloneElement(element as never, replaced as never)
			: element;
	}
}

/// What a module gets when it scales an offset without needing the host. The
/// curve is configured here rather than at import time because a file can reach
/// rem without ever constructing the host that would otherwise carry the config.
export function createVelaRemScaler(config?: RuntimeRemConfig): VelaRemScaler {
	__VelaRemCore.configure(config);

	return __VelaRem.scaler();
}

export namespace __VelaOpacity {
	export const Context = __VelaReact.createContext(1);

	type ProviderProps = { value: number; children?: defined };

	/// Fades everything below it, the alpha the transformer knew multiplied by
	/// whatever it is already nested in. The two have to multiply here rather
	/// than at the context, where the inner value would simply win.
	export const Provider = (props: ProviderProps) => {
		const total = __VelaReact.useContext(Context) * props.value;

		// Instances below cannot read a context, so they are faded here; a
		// component or a runtime host reads `total` for itself.
		return __VelaReact.createElement(
			Context.Provider,
			{ value: total },
			applyAlpha(props.children, total) as defined,
		) as __VelaReact.Element;
	};

	/// Hands `alpha` to everything rendered below, across the boundary the
	/// transformer cannot see through. Relative, like the provider it renders:
	/// the caller passes what it knows and the fade it sits in multiplies in.
	export function provide(alpha: number, children: defined[]): defined {
		return __VelaReact.createElement(
			Provider,
			{ value: alpha },
			...children,
		) as unknown as defined;
	}

	/// Ends the fade rather than passing it on. A CanvasGroup composites its
	/// whole subtree, so its own `GroupTransparency` already carries the alpha
	/// for everything below it — the absolute value is the point, since a
	/// relative one would multiply the very alpha this has to drop.
	export function stop(children: unknown): defined {
		return __VelaReact.createElement(
			Context.Provider,
			{ value: 1 },
			children as defined,
		) as unknown as defined;
	}

	/// Composes `alpha` onto the instances the caller could not fade statically.
	/// It stops at everything else: a component, a runtime host and a nested
	/// provider all read the same context for themselves, and fading them here
	/// as well would apply the alpha twice.
	export function applyAlpha(node: unknown, alpha: number): unknown {
		if (node === undefined || alpha >= 1) {
			return node;
		}

		if (__VelaReact.isValidElement(node as object)) {
			return applyToElement(node as __VelaReact.Element, alpha);
		}

		if (typeOf(node) !== "table") {
			return node;
		}

		// Children arrive as an array or as a table keyed by instance name, and
		// Roblox names the instance after that key, so the keys have to survive.
		const faded = new Map<unknown, unknown>();
		for (const [key, value] of pairs(node as Record<string, unknown>)) {
			faded.set(key, applyAlpha(value, alpha));
		}

		return faded;
	}

	function applyToElement(
		element: __VelaReact.Element,
		alpha: number,
	): unknown {
		const props = element.props as Record<string, unknown>;
		const elementType = element.type as unknown;

		// Only a string tag is an instance this can write to. Everything else
		// resolves against a context of its own, except a fragment: it renders
		// the children it was given as they are and reads nothing, so the fade
		// has to carry through it or die there.
		if (!typeIs(elementType, "string")) {
			const children = props.children;
			if (
				elementType !== (__VelaReact.Fragment as unknown) ||
				children === undefined
			) {
				return element;
			}

			return __VelaReact.cloneElement(
				element as never,
				{
					children: applyAlpha(children, alpha),
				} as never,
			);
		}

		// The tag on a rendered element is the Roblox class name — roblox-ts
		// lowers `<textlabel />` to `"TextLabel"` — while every table here is
		// keyed by the JSX tag the class list was resolved against.
		const tag = (elementType as string).lower();
		const names = __VelaOpacityCore.transparencyProps(tag);
		const children = props.children;
		if (names.size() === 0 && children === undefined) {
			return element;
		}

		const faded: Record<string, unknown> = {};
		for (const name of names) {
			const current = props[name];
			faded[name] = __VelaOpacityCore.compose(
				typeIs(current, "number") ? current : 0,
				alpha,
			);
		}

		if (tag === "canvasgroup") {
			// Its own `GroupTransparency` now carries the fade for everything
			// below it, and a consumer down there would apply it a second time.
			if (children !== undefined) {
				faded.children = stop(children);
			}
		} else {
			faded.children = applyAlpha(children, alpha);
		}

		return __VelaReact.cloneElement(element as never, faded as never);
	}
}

/// What reaches an element through the tree rather than through its own class
/// list, and can only be read where the tree is: an enclosing fade, and the pin
/// a container opened over its whole subtree.
export namespace __VelaBoundary {
	const PinContext = __VelaReact.createContext(false);

	/// Whether the offsets of whatever renders here are literal pixels. Read by
	/// the runtime host, which resolves its own class value and has to scale
	/// what it resolves the same way the emit around it was scaled.
	export function usePinned(): boolean {
		return __VelaReact.useContext(PinContext);
	}

	/// Pins everything below to the offsets it was written with. A `SurfaceGui`
	/// gets its pixel space from the part it is drawn on, so the viewport the
	/// rem curve follows says nothing about what happens under one.
	export const Pin = (props: { children?: defined }) =>
		__VelaReact.createElement(
			PinContext.Provider,
			{ value: true },
			// Instances below cannot read a context; a component or a runtime
			// host reads the pin for itself.
			__VelaRem.unpin(props.children) as defined,
		) as __VelaReact.Element;

	/// Reads what crossed the boundary on behalf of a component whose root the
	/// transformer lowered statically. Nothing in that subtree resolves anything
	/// at runtime, so this is the last place either of them can still reach it.
	export function Consume(props: { children?: defined }): __VelaReact.Element {
		const alpha = __VelaReact.useContext(__VelaOpacity.Context);
		const pinned = usePinned();
		let children = props.children;

		if (pinned) {
			children = __VelaRem.unpin(children) as defined;
		}

		return (
			alpha < 1 ? __VelaOpacity.applyAlpha(children, alpha) : children
		) as __VelaReact.Element;
	}
}

namespace __VelaDivide {
	export function interleaveDivideSeparators(
		divide: RuntimeDivide,
		children: defined[],
	): defined[] {
		const color = __VelaDivideCore.separatorColor(divide);
		const size = __VelaDivideCore.separatorSize(divide);

		const result: defined[] = [];
		let seenContentChild = false;
		for (const child of children) {
			if (isModifierChild(child)) {
				result.push(child);
				continue;
			}
			if (seenContentChild) {
				result.push(
					__VelaReact.createElement("frame", {
						BackgroundColor3: color,
						BackgroundTransparency: divide.transparency ?? 0,
						BorderSizePixel: 0,
						Size: size,
					} as never),
				);
			}
			seenContentChild = true;
			result.push(child);
		}
		return result;
	}

	/// UICorner, UIListLayout and the rest of the UI* family modify their parent
	/// instead of taking a slot in it, so dividers have to step over them.
	export function isModifierChild(child: defined): boolean {
		const elementType = (child as { type?: unknown }).type;
		if (!typeIs(elementType, "string")) {
			return false;
		}
		return __VelaLua.startsWith(elementType.lower(), "ui");
	}
}

namespace __VelaMargin {
	export function renderMarginWrapper(
		margin: RuntimeMargin,
		wrapperProps: Record<string, unknown>,
		element: defined,
	): defined {
		const padding = __VelaReact.createElement("uipadding", {
			PaddingTop: new UDim(0, margin.top),
			PaddingRight: new UDim(0, margin.right),
			PaddingBottom: new UDim(0, margin.bottom),
			PaddingLeft: new UDim(0, margin.left),
		} as never);

		return __VelaReact.createElement(
			"frame",
			wrapperProps as never,
			padding,
			element,
		);
	}
}

/// Two readings of the same attribute set. A fresh table every change would
/// re-render the element even where nothing about it moved.
function sameAttributes(
	previous: Record<string, unknown>,
	latest: Record<string, unknown>,
): boolean {
	for (const [name, value] of pairs(latest)) {
		if (previous[name as string] !== value) {
			return false;
		}
	}

	for (const [name] of pairs(previous)) {
		if (latest[name as string] === undefined) {
			return false;
		}
	}

	return true;
}

namespace __VelaEnv {
	export function useRuntimeEnvironment(): RuntimeEnvironment {
		const [camera, setCamera] = __VelaReact.useState(
			() => __VelaWorkspace.CurrentCamera as RuntimeCamera | undefined,
		);
		const [player, setPlayer] = __VelaReact.useState(
			() => __VelaPlayers.LocalPlayer,
		);
		const [environment, setEnvironment] = __VelaReact.useState(() =>
			__VelaEnvCore.readRuntimeEnvironment(camera),
		);

		// The local player arrives after the first render on some load paths, and
		// its attribute is where the color scheme lives.
		__VelaReact.useEffect(() => {
			const connection = __VelaPlayers
				.GetPropertyChangedSignal("LocalPlayer")
				.Connect(() => setPlayer(__VelaPlayers.LocalPlayer));

			return () => {
				connection.Disconnect();
			};
		}, []);

		__VelaReact.useEffect(() => {
			const updateCamera = () =>
				setCamera(__VelaWorkspace.CurrentCamera as RuntimeCamera | undefined);
			const connection = __VelaWorkspace
				.GetPropertyChangedSignal("CurrentCamera")
				.Connect(updateCamera);

			return () => {
				connection.Disconnect();
			};
		}, []);

		__VelaReact.useEffect(() => {
			const updateEnvironment = () =>
				setEnvironment((previous) => {
					const latest = __VelaEnvCore.readRuntimeEnvironment(camera);
					return previous.width === latest.width &&
						previous.rem === latest.rem &&
						previous.orientation === latest.orientation &&
						previous.input === latest.input &&
						previous.colorScheme === latest.colorScheme
						? previous
						: latest;
				});

			updateEnvironment();

			const connections = [
				__VelaUserInputService
					.GetPropertyChangedSignal("TouchEnabled")
					.Connect(updateEnvironment),
				__VelaUserInputService
					.GetPropertyChangedSignal("MouseEnabled")
					.Connect(updateEnvironment),
				__VelaUserInputService
					.GetPropertyChangedSignal("GamepadEnabled")
					.Connect(updateEnvironment),
			];

			if (player !== undefined) {
				connections.push(
					player
						.GetAttributeChangedSignal(
							__VelaEnvCore.VELA_COLOR_SCHEME_ATTRIBUTE,
						)
						.Connect(updateEnvironment),
				);
			}

			// ViewportSize stays 1x1 until the first frame renders, so breakpoints have
			// to follow the signal instead of the mount-time read.
			const viewport = __VelaEnvCore.debounceViewport(updateEnvironment);
			if (camera !== undefined) {
				connections.push(
					camera
						.GetPropertyChangedSignal("ViewportSize")
						.Connect(viewport.call),
				);
			}

			return () => {
				viewport.cancel();
				for (const connection of connections) {
					connection.Disconnect();
				}
			};
		}, [camera, player]);

		return environment;
	}
}

type VelaRuntimeHostProps = {
	__velaTag: VelaRuntimeTag;
	__velaRules?: readonly RuntimeRule[];
	/// What each branch rule's condition reads, by index. The transformer
	/// narrows every test where it is written, so an expression several rules
	/// hang on is evaluated once.
	__velaTests?: readonly boolean[];
	/// Which of the props below the transformer lowered are pixel offsets. It
	/// names them instead of scaling them in the emit because this element
	/// re-renders on a rem change anyway, and a value beats a binding the
	/// composition step would have to read back.
	__velaRem?: readonly string[];
	/// Whether a container this pass could see pins those offsets to literal
	/// pixels. What arrives as context says the same thing for a pin that was
	/// opened in a file this element's own was compiled without.
	__velaRemPinned?: boolean;
	__velaTransition?: RuntimeTransition;
	__velaAnimation?: string;
	__velaText?: RuntimeTextSpec;
	__velaMargin?: RuntimeMargin;
	__velaDivide?: RuntimeDivide;
	/// The alpha an enclosing `opacity-*` has left for this element.
	__velaOpacity?: number;
	className?: ClassValue;
	children?: defined | readonly defined[];
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
	"__velaMargin",
	"__velaDivide",
	"__velaOpacity",
	"className",
	"children",
]);

// `forwardRef` fixes one ref type for the whole component, which would leave
// every consumer ref typed as `unknown`. Restating it as a generic call lets
// `ref` follow whichever host tag the transformer lowered to.
type VelaRuntimeHostComponent = <Tag extends VelaRuntimeTag>(
	props: VelaRuntimeHostProps & {
		__velaTag: Tag;
		ref?: __VelaReact.Ref<VelaRefTarget<Tag>>;
	},
) => __VelaReact.Element;

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

	// forwardRef so slotting libraries (asChild-style cloneElement) and plain
	// consumer refs reach the rendered instance instead of dying on a function
	// component.
	return __VelaReact.forwardRef(
		(props: VelaRuntimeHostProps, forwardedRef: unknown) => {
			const globalEnvironment = __VelaEnv.useRuntimeEnvironment();
			const ambientAlpha = __VelaReact.useContext(__VelaOpacity.Context);
			const pinned =
				__VelaBoundary.usePinned() || props.__velaRemPinned === true;
			const [hovered, setHovered] = __VelaReact.useState(false);
			const [pressed, setPressed] = __VelaReact.useState(false);
			const [focused, setFocused] = __VelaReact.useState(false);
			// Exactly the attributes this element's styling reads. An element
			// that names no attribute variant gets an empty list here and
			// connects nothing, which is the whole cost of the feature for the
			// elements that do not use it.
			const attributeNames = __VelaReact.useMemo(
				() =>
					__VelaResolution.attributeNames(
						theme,
						(props.__velaRules ?? []) as RuntimeRule[],
						props.className,
					),
				[props.className],
			);
			const attributeKey = __VelaLua.join(attributeNames, " ");
			const [attributes, setAttributes] = __VelaReact.useState<
				Record<string, unknown>
			>({});
			// Held as state rather than read off the ref, so the subscription
			// follows an instance React replaced instead of staying on the one
			// that was current when the effect first ran.
			const [attributeHost, setAttributeHost] = __VelaReact.useState<
				Instance | undefined
			>(undefined);
			const environment: RuntimeEnvironment = {
				width: globalEnvironment.width,
				// A pinned subtree resolves at the base, which is the rem a ratio
				// of 1 comes out of: the offsets it writes are the literal ones.
				rem: pinned ? __VelaRemCore.base() : globalEnvironment.rem,
				orientation: globalEnvironment.orientation,
				input: globalEnvironment.input,
				colorScheme: globalEnvironment.colorScheme,
				hovered,
				pressed,
				focused,
				attributes,
				tests: props.__velaTests,
			};
			const __velaTag = props.__velaTag;
			const __velaRules = props.__velaRules ?? [];
			const className = props.className;
			const children = props.children;

			// A component tag decides its own rendering, so there is no instance to
			// tween; motion utilities only engage on real host tags.
			const instanceCapable = typeIs(__velaTag, "string");
			// Host-specific lowering needs the tag, and a component hides it — the
			// static path takes the same `None` branch there.
			const hostTag = instanceCapable ? (__velaTag as string) : undefined;

			const resolution = __VelaResolution.resolveRuntimeResolution(
				theme,
				environment,
				__velaRules as RuntimeRule[],
				className,
				preflight,
				hostTag,
			);
			// Two alphas arrive by different routes and have gotten different
			// distances. The transformer's already reached this element's static
			// props on the way out; the context's crossed a component boundary it
			// could not see through, so nothing here has met it yet.
			const explicitAlpha = props.__velaOpacity ?? 1;
			const inheritedAlpha = explicitAlpha * ambientAlpha;
			if (hostTag !== undefined && inheritedAlpha < 1) {
				__VelaResolution.composeInheritedOpacity(
					resolution,
					hostTag,
					inheritedAlpha,
				);
			}
			const resolvedTransition = __VelaMotion.resolveTransitionConfig(
				props.__velaTransition,
				resolution.transition,
			);
			const transition = instanceCapable ? resolvedTransition : undefined;
			const animation = resolution.animation ?? props.__velaAnimation;
			const animationActive =
				instanceCapable && animation !== undefined && animation !== "none";
			const margin = __VelaMarginCore.resolveMarginConfig(
				props.__velaMargin,
				resolution.margin,
				resolution.remRatio ?? 1,
			);
			const divide = __VelaDivideCore.resolveDivideConfig(
				props.__velaDivide,
				resolution.divide,
				resolution.remRatio ?? 1,
			);

			const instanceRef = __VelaReact.useRef<Instance | undefined>(undefined);
			const heldProps = __VelaReact.useRef<RuntimePropMap | undefined>(
				undefined,
			);
			const lastGoal = __VelaReact.useRef<RuntimePropMap | undefined>(
				undefined,
			);
			// A helper is an instance of its own, so tweening one needs its ref
			// and its own held values, the same two the element itself needs.
			const helperRefs = __VelaReact.useRef(new Map<string, Instance>());
			const heldHelperProps = __VelaReact.useRef(
				new Map<string, RuntimePropMap>(),
			);
			const lastHelperGoal = __VelaReact.useRef<
				Map<string, RuntimePropMap> | undefined
			>(undefined);

			const hostProps: Record<string, unknown> = {};
			for (const [name, value] of pairs(props as Record<string, unknown>)) {
				if (!HOST_OWN_PROPS.has(name as string)) {
					hostProps[name as string] = value;
				}
			}
			// Before the resolution merges in: what it carries was already scaled
			// on its way into the resolution, and scaling twice would compound.
			const remRatio = resolution.remRatio ?? 1;
			if (remRatio !== 1) {
				for (const name of props.__velaRem ?? []) {
					const value = hostProps[name];
					if (value !== undefined) {
						hostProps[name] = __VelaRemCore.apply(
							value as RuntimePropValue,
							remRatio,
						);
					}
				}
			}
			for (const [name, value] of pairs(resolution.props)) {
				hostProps[name] = value;
			}
			const textSize = hostProps.TextSize;
			if (
				typeIs(textSize, "number") &&
				textSize > __VelaRemCore.TEXT_SIZE_CEILING
			) {
				hostProps.TextSize = __VelaRemCore.TEXT_SIZE_CEILING;
			}

			// Props the element was handed rather than resolved — its own static
			// lowering, a spread from the component above it — are what the
			// context's alpha has not reached yet; what this element resolved has
			// already met it above. A channel that was never set still paints:
			// an untouched `TextTransparency` is opaque text.
			if (hostTag !== undefined && ambientAlpha < 1) {
				for (const name of __VelaOpacityCore.transparencyProps(hostTag)) {
					if (resolution.props[name] !== undefined) {
						continue;
					}

					const current = hostProps[name];
					hostProps[name] = __VelaOpacityCore.compose(
						typeIs(current, "number") ? current : 0,
						ambientAlpha,
					);
				}
			}

			__VelaApply.applyComposedResolution(hostProps, resolution, preflight);

			if (resolution.usesHover === true) {
				__VelaVariant.attachHoverTracking(hostProps, setHovered);
			}

			if (resolution.usesActive === true) {
				__VelaVariant.attachActiveTracking(hostProps, setPressed);
			}

			if (resolution.usesFocus === true) {
				__VelaVariant.attachFocusTracking(hostProps, __velaTag, setFocused);
			}

			// Attributes live on the instance, so the first render has none to
			// read; the effect below fills them in and every later change comes
			// through the attribute's own signal.
			__VelaReact.useEffect(() => {
				const instance = attributeHost;
				if (instance === undefined || attributeNames.size() === 0) {
					return undefined;
				}

				const read = () => {
					const latest: Record<string, unknown> = {};
					for (const name of attributeNames) {
						latest[name] = instance.GetAttribute(name);
					}
					return latest;
				};
				const refresh = () =>
					setAttributes((previous) => {
						const latest = read();
						return sameAttributes(previous, latest) ? previous : latest;
					});

				refresh();

				const connections: RBXScriptConnection[] = [];
				for (const name of attributeNames) {
					connections.push(
						instance.GetAttributeChangedSignal(name).Connect(refresh),
					);
				}

				return () => {
					for (const connection of connections) {
						connection.Disconnect();
					}
				};
			}, [attributeHost, attributeKey]);

			__VelaText.applyTextConfig(hostProps, props.__velaText, resolution);

			// With a transition, React keeps rendering the first-seen value for
			// every tweenable prop so it never rewrites the instance; the effect
			// below moves the real property with TweenService instead.
			//
			// This walks the merged props rather than `resolution.props`, because a
			// base utility like `bg-slate-700` lowers statically and only ever
			// arrives as a plain prop. Seeding from the resolution alone first sees
			// the prop on the render a variant introduces it, holds that new value,
			// and leaves the tween nothing to travel from.
			const tweenGoal: RuntimePropMap = {};
			if (transition !== undefined) {
				if (heldProps.current === undefined) {
					heldProps.current = {};
				}
				const held = heldProps.current;
				for (const [name, value] of pairs(hostProps)) {
					if (!__VelaMotion.isTweenableValue(value)) {
						continue;
					}
					// Layout props move to the margin wrapper, which the inner
					// instance ref cannot tween; they apply instantly instead.
					if (
						margin !== undefined &&
						__VelaMarginCore.isMarginWrapperProp(name as string)
					) {
						continue;
					}
					if (
						!__VelaMotion.transitionCoversProp(
							transition.property,
							name as string,
						)
					) {
						continue;
					}
					tweenGoal[name as string] = value;
					if (held[name as string] === undefined) {
						held[name as string] = value;
					}
					hostProps[name as string] = held[name as string];
				}
			}
			if (
				transition !== undefined ||
				animationActive ||
				attributeNames.size() > 0
			) {
				hostProps.ref = (instance: Instance | undefined) => {
					instanceRef.current = instance;
					// React re-attaches a fresh callback on every render, which
					// detaches the old one first; reporting that detach would
					// take the subscription down and put it straight back. Only
					// an instance is reported, and the effect's own cleanup is
					// what covers the unmount.
					if (attributeNames.size() > 0 && instance !== undefined) {
						setAttributeHost(instance);
					}
					__VelaText.assignForwardedRef(forwardedRef, instance);
				};
			} else if (forwardedRef !== undefined) {
				hostProps.ref = forwardedRef;
			}

			__VelaReact.useEffect(() => {
				const instance = instanceRef.current;
				if (instance === undefined || !animationActive) {
					return undefined;
				}
				return __VelaMotion.startPresetAnimation(instance, animation as string);
			}, [animation]);

			__VelaReact.useEffect(() => {
				if (transition === undefined) {
					lastGoal.current = undefined;
					return;
				}

				const instance = instanceRef.current;
				const previous = lastGoal.current;
				lastGoal.current = tweenGoal;
				if (instance === undefined || previous === undefined) {
					return;
				}

				const changed: Record<string, RuntimePropValue> = {};
				let hasChanged = false;
				for (const [name, value] of pairs(tweenGoal)) {
					if (previous[name as string] !== value) {
						changed[name as string] = value;
						hasChanged = true;
					}
				}
				if (!hasChanged) {
					return;
				}

				__VelaMotion.playTransition(instance, changed, transition, {
					owner: instance,
				});
			});
			__VelaApply.applyHelperDefaults(resolution.helpers);

			// A helper carries the properties `rounded-*`, `border-*` and
			// `shadow-*` lower to, so a variant that repaints one is a style
			// change like any other, except that it lands on a child instance. The
			// held value is what renders while the tween moves the real one, the
			// same trick the element's own props use above.
			const helperGoals = new Map<string, RuntimePropMap>();
			const helperProps = resolution.helpers.map((helper) => {
				const rendered = __VelaApply.helperToProps(helper.props);
				if (transition === undefined) {
					return rendered;
				}

				const held = heldHelperProps.current.get(helper.tag) ?? {};
				heldHelperProps.current.set(helper.tag, held);
				const goal: RuntimePropMap = {};

				for (const [name, value] of pairs(rendered)) {
					const property = name as string;
					if (
						!__VelaMotion.isTweenableValue(value) ||
						!__VelaMotion.transitionCoversProp(
							transition.property,
							property,
							helper.tag,
						)
					) {
						continue;
					}

					goal[property] = value as RuntimePropValue;
					if (held[property] === undefined) {
						held[property] = value as RuntimePropValue;
					}
					rendered[property] = held[property];
				}

				helperGoals.set(helper.tag, goal);
				return rendered;
			});

			__VelaReact.useEffect(() => {
				if (transition === undefined) {
					lastHelperGoal.current = undefined;
					return;
				}

				const previous = lastHelperGoal.current;
				lastHelperGoal.current = helperGoals;
				if (previous === undefined) {
					return;
				}

				const owner = instanceRef.current;
				for (const [tag, goal] of helperGoals) {
					const instance = helperRefs.current.get(tag);
					const before = previous.get(tag);
					if (instance === undefined || before === undefined) {
						continue;
					}

					const changed: Record<string, RuntimePropValue> = {};
					let hasChanged = false;
					for (const [name, value] of pairs(goal)) {
						if (before[name as string] !== value) {
							changed[name as string] = value;
							hasChanged = true;
						}
					}
					if (!hasChanged) {
						continue;
					}

					__VelaMotion.playTransition(instance, changed, transition, {
						owner: owner ?? instance,
						helper: tag,
					});
				}
			});

			const runtimeChildren = resolution.helpers.map((helper, index) => {
				const rendered = helperProps[index] ?? {};
				if (transition !== undefined) {
					rendered.key = helper.tag;
					rendered.ref = (instance: Instance | undefined) => {
						if (instance === undefined) {
							helperRefs.current.delete(helper.tag);
						} else {
							helperRefs.current.set(helper.tag, instance);
						}
					};
				}

				return __VelaReact.createElement(
					__VelaApply.hostClassName(helper.tag),
					rendered,
				);
			});
			const allChildren: defined[] = [];
			for (const child of runtimeChildren) {
				if (child !== undefined) {
					allChildren.push(child);
				}
			}
			let userChildren = __VelaApply.normalizeChildren(children);
			if (divide !== undefined) {
				userChildren = __VelaDivide.interleaveDivideSeparators(
					divide,
					userChildren,
				);
			}
			// The helpers above were resolved here and `composeInheritedOpacity`
			// already faded them. These children were written elsewhere: only the
			// transformer's alpha reached them, and the two this element learned
			// at render time — the context's, and its own from a class list the
			// transformer could not read — are handed to them here.
			//
			// A component tag hands over nothing: the provider below covers
			// everything it renders, and these children are part of that.
			const ownAlpha = resolution.opacityAlpha ?? 1;
			const childAlpha = hostTag === undefined ? 1 : ownAlpha;
			let faded = userChildren;
			if (hostTag === "canvasgroup") {
				if (ambientAlpha < 1) {
					faded = [__VelaOpacity.stop(userChildren)];
				}
			} else if (ambientAlpha * childAlpha < 1) {
				faded = [__VelaOpacity.provide(childAlpha, userChildren)];
			}
			for (const child of faded) {
				if (child !== undefined) {
					allChildren.push(child);
				}
			}

			const wrapperProps =
				margin !== undefined
					? __VelaMarginCore.prepareMarginWrapper(margin, hostProps)
					: undefined;

			// React renders a component reference the same way it renders a host tag.
			const element = __VelaReact.createElement(
				__velaTag as SupportedHostElementTag,
				hostProps,
				...allChildren,
			);

			const rendered =
				margin !== undefined && wrapperProps !== undefined
					? __VelaMargin.renderMarginWrapper(margin, wrapperProps, element)
					: element;

			// A component element hides which instance it will render, so its own
			// `opacity-*` and everything it inherited cross into whatever it
			// renders as context and lower there against a tag that is known.
			// The provider multiplies the ambient alpha back in, so only what it
			// does not already carry is passed.
			if (hostTag === undefined) {
				const subtreeAlpha = explicitAlpha * ownAlpha;
				if (subtreeAlpha < 1) {
					return __VelaOpacity.provide(subtreeAlpha, [
						rendered as defined,
					]) as never;
				}
			}

			return rendered as never;
		},
	);
}

export type {
	VelaMotionDriver,
	VelaRemScaler,
	VelaRuntimeConfig,
	VelaRuntimeHostComponent,
};
