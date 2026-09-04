import Vide from "@rbxts/vide";

// The source form a Vide project actually writes. Everything here is lowered by
// the transformer against `framework: "vide"`, so what Studio renders is the
// real emit rather than a hand-port of the React one.
//
// Probes are grouped by what they are meant to catch, not by how they look.

// Behind a call, the one shape the compiler cannot read, so what it names is
// left for the runtime resolver.
const remClass = (active: boolean) =>
	active
		? "w-[6rem] p-[0.5rem] rounded-[0.25rem]"
		: "w-[96px] p-[8px] rounded-[4px]";

function Row(props: { label: string; children?: Vide.Node }) {
	return (
		<frame className="w-full h-8">
			<uilistlayout
				FillDirection={Enum.FillDirection.Horizontal}
				Padding={new UDim(0, 6)}
				VerticalAlignment={Enum.VerticalAlignment.Center}
			/>
			<textlabel
				className="w-32 h-full text-slate-400 text-left text-xs"
				Text={props.label}
			/>
			{props.children}
		</frame>
	);
}

/// Statically lowered: props, helper children and rem-scaled offsets all land
/// in the emit, and none of it reaches the runtime.
function StaticUtilities() {
	return (
		<>
			<Row label="bg + rounded + p">
				<frame className="w-24 h-6 bg-slate-800 rounded-lg p-2" />
			</Row>
			<Row label="directional rounded">
				<frame className="w-24 h-6 bg-slate-800 rounded-l-lg" />
			</Row>
			<Row label="border">
				<frame className="w-24 h-6 bg-slate-800 border-2 border-blue-500 rounded-md" />
			</Row>
			<Row label="text">
				<textlabel
					className="w-40 h-6 bg-slate-800 text-white text-sm font-bold uppercase rounded-sm"
					Text="text utilities"
				/>
			</Row>
			<Row label="flex + gap">
				<frame className="w-40 h-6 bg-slate-800 flex flex-row items-center gap-2 px-2">
					<frame className="size-3 bg-red-500 rounded-full" />
					<frame className="size-3 bg-emerald-500 rounded-full" />
					<frame className="size-3 bg-blue-500 rounded-full" />
				</frame>
			</Row>
			<Row label="m-2 wrapper">
				<frame className="w-24 h-6 bg-fuchsia-500 m-2 rounded-sm" />
			</Row>
			<Row label="divide-x">
				<frame className="w-24 h-6 bg-slate-800 flex flex-row divide-x-2 divide-blue-500">
					<frame className="w-8 h-full bg-slate-600" />
					<frame className="w-8 h-full bg-slate-600" />
				</frame>
			</Row>
			<Row label="aspect + z">
				<frame className="h-6 aspect-square bg-amber-500 rounded-sm z-10" />
			</Row>
			{/* Written in the unit rem scales by: the row beside it says the same
			    thing in pixels, so the two have to stay the same width. */}
			<Row label="arbitrary rem">
				<frame className="w-[6rem] h-[1.5rem] bg-teal-500 rounded-[0.25rem] border-[0.125rem] border-teal-200" />
			</Row>
			<Row label="arbitrary px">
				<frame className="w-[96px] h-[24px] bg-teal-500 rounded-[4px] border-[2px] border-teal-200" />
			</Row>
		</>
	);
}

/// Reaches the runtime host, because a derivable class value cannot be read at
/// compile time. Its helper children have to follow rem the same way the static
/// path's do.
function DerivableClassValue(props: {
	active: () => boolean;
	padded: () => string;
}) {
	return (
		<>
			<Row label="derivable bg">
				<frame
					className={() =>
						props.active()
							? "w-24 h-6 bg-red-500 rounded-lg"
							: "w-24 h-6 bg-blue-500 rounded-lg"
					}
				/>
			</Row>
			<Row label="remainder + p-4">
				<frame
					className={() => `w-40 h-6 bg-slate-700 p-4 ${props.padded()}`}
				/>
			</Row>
			<Row label="helper appears">
				<frame
					className={() =>
						props.active()
							? "w-24 h-6 bg-slate-700 border-2 border-amber-500"
							: "w-24 h-6 bg-slate-700"
					}
				/>
			</Row>
			{/* Behind a call, so the rem length is parsed by the runtime resolver
			    rather than by the compiler. */}
			<Row label="rem on the host">
				<frame
					className={() => `h-6 bg-teal-500 ${remClass(props.active())}`}
				/>
			</Row>
			<Row label="dictionary">
				<frame
					className={() => ({
						"w-24 h-6 rounded-lg": true,
						"bg-emerald-500": props.active(),
						"bg-slate-600": !props.active(),
					})}
				/>
			</Row>
		</>
	);
}

/// Driven by input rather than by the environment. The state lives in the host
/// and the trackers compose onto the instance's own events.
function InteractionVariants() {
	return (
		<>
			<Row label="hover:">
				<textbutton
					className="w-24 h-6 bg-slate-700 hover:bg-blue-500 text-white text-xs rounded-sm"
					Text="hover"
				/>
			</Row>
			<Row label="hover: axis">
				<textbutton
					className="w-24 h-6 bg-slate-700 hover:w-1/2 text-white text-xs"
					Text="wide"
				/>
			</Row>
			{/* The only tag whose focus is a signal rather than gamepad selection,
			    so it is the one a headless check can drive. */}
			<Row label="focus:">
				<textbox
					className="w-24 h-6 bg-slate-700 focus:bg-amber-500 text-white text-xs rounded-sm"
					Text="focus"
				/>
			</Row>
			<Row label="active:">
				<textbutton
					className="w-24 h-6 bg-slate-700 active:bg-emerald-500 text-white text-xs rounded-sm"
					Text="press"
				/>
			</Row>
		</>
	);
}

/// Resolved against the environment rather than the class list alone.
function EnvironmentVariants() {
	return (
		<>
			<Row label="md: width">
				<frame className="w-full md:w-1/2 h-6 bg-violet-500 rounded-sm" />
			</Row>
			<Row label="md: color">
				<frame className="w-24 h-6 bg-slate-700 md:bg-cyan-500 rounded-sm" />
			</Row>
			<Row label="dark:">
				<frame className="w-24 h-6 bg-white dark:bg-slate-900 rounded-sm" />
			</Row>
		</>
	);
}

/// The alpha crosses a component boundary as context, so it reaches instances
/// this pass never saw.
function InheritedOpacity() {
	return (
		<Row label="opacity-50">
			<frame className="w-40 h-6 opacity-50">
				<textlabel
					className="size-full bg-red-500 text-white text-xs rounded-sm"
					Text="faded"
				/>
			</frame>
		</Row>
	);
}

/// A nested subtree behind a component boundary: only the consumer wrapped
/// around what the component returned can still reach it, and it has to reach
/// past the root it is handed.
function NestedNode() {
	return (
		<frame className="w-40 h-6 bg-slate-700 rounded-sm flex flex-row gap-1 p-1">
			<frame className="size-4 bg-red-500 rounded-full" />
			<frame className="size-4 bg-emerald-500 rounded-full" />
		</frame>
	);
}

/// Its root reaches the runtime host, so what the class list could not carry —
/// the static half of it — is a prop the host was handed rather than one it
/// resolved. Only the ambient alpha has not met those yet.
function StaticPropUnderFade() {
	return (
		<frame
			className={() => `w-40 h-6 ${probeClass()}`}
			BackgroundColor3={Color3.fromRGB(251, 44, 54)}
			BackgroundTransparency={0}
		/>
	);
}

/// Where the three alphas the runtime has to carry itself are measured: onto
/// the props the element was handed, into a component the host renders, and
/// down to children the host already has.
function RuntimeOpacity() {
	return (
		<>
			<Row label="ambient on static">
				<StaticPropUnderFade className="opacity-50" />
			</Row>
			<Row label="runtime opacity kids">
				<frame className={() => `w-40 h-6 opacity-50 ${probeClass()}`}>
					<textlabel
						className="size-full bg-red-500 text-white text-xs rounded-sm"
						Text="child"
					/>
				</frame>
			</Row>
			<Row label="runtime opacity comp">
				<NestedNode className={() => `opacity-50 ${probeClass()}`} />
			</Row>
			{/* A handler and a derivable prop are the same type. Only the property
			    behind the name tells them apart, and reading one as the other
			    calls it. */}
			<Row label="handler not called">
				<textbutton
					className={() => `w-40 h-6 bg-slate-700 ${probeClass()}`}
					Text={() => `clicks: ${clicks()}`}
					MouseButton1Click={() => clicks(clicks() + 1)}
				/>
			</Row>
		</>
	);
}

const clicks = Vide.source(0);

/// Nothing here is in the class list the host is built with. Everything the
/// resolution can still name — a prop, a variant, a separator — has to arrive
/// on a later reading rather than be fixed at construction.
function LateArrivals(props: { active: () => boolean }) {
	return (
		<>
			{/* Neither a rule nor the first reading names a corner radius or a
			    stroke, so both have to be discovered after the fact. */}
			<Row label="late prop">
				<frame
					className={() =>
						props.active()
							? "w-24 h-6 bg-slate-700 rounded-xl border-2 border-amber-500"
							: "w-24 h-6 bg-slate-700"
					}
				/>
			</Row>
			{/* `hover:` is absent from the first reading, so a tracker fixed to it
			    would never bring the state about. */}
			<Row label="late hover:">
				<textbutton
					className={() =>
						props.active()
							? "w-24 h-6 bg-slate-700 hover:bg-rose-500 text-white text-xs rounded-sm"
							: "w-24 h-6 bg-slate-700 text-white text-xs rounded-sm"
					}
					Text="late"
				/>
			</Row>
			{/* The one effect that cannot be applied after the fact: the box a
			    margin needs goes above an element that is parented as soon as it
			    is built, so the transformer says up front that one is coming. */}
			<Row label="late margin">
				<frame
					className={() =>
						props.active()
							? "w-24 h-6 bg-fuchsia-500 m-2 rounded-sm"
							: "w-24 h-6 bg-fuchsia-500 rounded-sm"
					}
				/>
			</Row>
			<Row label="late divide">
				<frame
					className={() =>
						props.active()
							? "w-24 h-6 bg-slate-800 flex flex-row divide-x-2 divide-blue-500"
							: "w-24 h-6 bg-slate-800 flex flex-row"
					}
				>
					<frame className="w-8 h-full bg-slate-600" />
					<frame className="w-8 h-full bg-slate-600" />
				</frame>
			</Row>
		</>
	);
}

const probeClass = () => "rounded-sm";

/// Props the host reads off itself rather than off the resolution. Every one of
/// them is a name no instance has a member for.
function HostOwnProps() {
	return (
		<>
			{/* A literal `Text` on a runtime host is transformed by the runtime
			    rather than at compile time, because the class list has to reach
			    the host for the variant beside it. */}
			<Row label="uppercase + hover:">
				<textbutton
					className="w-40 h-6 bg-slate-700 uppercase hover:bg-blue-500 text-white text-xs rounded-sm"
					Text="text case"
				/>
			</Row>
			<Row label="underline">
				<textbutton
					className="w-40 h-6 bg-slate-700 underline hover:bg-blue-500 text-white text-xs rounded-sm"
					Text="decorated"
				/>
			</Row>
			<Row label="transition">
				<textbutton
					className="w-24 h-6 bg-slate-700 transition-colors duration-300 hover:bg-fuchsia-500 text-white text-xs rounded-sm"
					Text="tween"
				/>
			</Row>
			<Row label="animate-spin">
				<frame className="size-6 bg-amber-500 rounded-sm animate-spin" />
			</Row>
			{/* No static counterpart for the rule to fall back to: off hover the
			    resolution names nothing, and what the class was created with is
			    all that is left to write. */}
			<Row label="variant-only prop">
				<textbutton
					className="w-24 h-6 bg-slate-700 hover:font-bold text-white text-xs rounded-sm"
					Text="weight"
				/>
			</Row>
			{/* Behind a call, so the class value stays on the runtime path and the
			    host renders the component itself rather than stepping aside. */}
			<Row label="component children">
				<ChildSlot className={() => `w-40 h-6 ${slotClass()}`}>
					<textlabel
						className="size-full bg-emerald-600 text-white text-xs rounded-sm"
						Text="children arrived"
					/>
				</ChildSlot>
			</Row>
			<Row label="opacity over subtree">
				<NestedNode className="opacity-25" />
			</Row>
		</>
	);
}

const slotClass = () => "rounded-sm";

/// A component the runtime host renders rather than an instance. Vide hands a
/// component its children under `children`, so a host that numbered them into
/// the array part would leave this one with none. What the host resolved
/// arrives alongside them, which is why the props are open.
function ChildSlot(props: { children?: Vide.Node } & Record<string, unknown>) {
	return (
		<frame className="w-40 h-6 bg-slate-800 rounded-sm">
			{props.children ?? (
				<textlabel
					className="size-full bg-red-600 text-white text-xs rounded-sm"
					Text="no children"
				/>
			)}
		</frame>
	);
}

/// A SurfaceGui is drawn on a part, at the pixel space that part gives it, so
/// the curve is pinned under one. Vide reads the pin where a thunk is built,
/// which is why the children below it are deferred into the scope.
export function SurfacePanel() {
	return (
		<surfacegui>
			<frame className="w-24 h-6 bg-slate-800 rounded-lg p-2">
				<NestedNode />
			</frame>
		</surfacegui>
	);
}

export function App() {
	const active = Vide.source(false);
	// A template the collapser cannot read, so this one stays on the runtime
	// path and keeps rem covered there after the arrow unwrap folds the rest.
	const padded = Vide.source("rounded-md");

	// Nothing re-renders in Vide, so a flipping source is the only way to see
	// whether a derivable class value actually re-resolves.
	task.spawn(() => {
		while (true) {
			task.wait(1);
			active(!active());
		}
	});

	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset={true}>
			<frame
				className="bg-slate-950 rounded-xl p-4 flex flex-col gap-1"
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={UDim2.fromOffset(520, 540)}
			>
				{StaticUtilities()}
				{DerivableClassValue({ active, padded })}
				{InteractionVariants()}
				{EnvironmentVariants()}
				{InheritedOpacity()}
				{RuntimeOpacity()}
				{HostOwnProps()}
				{LateArrivals({ active })}
			</frame>
		</screengui>
	);
}
