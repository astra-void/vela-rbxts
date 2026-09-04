import React from "@rbxts/react";

// A statically lowered root: nothing here resolves at render time, so the only
// way a fade written around `<FadedLabel />` reaches this text is the context.
const FadedLabel = (props: { text: string }) => (
	<textlabel
		BackgroundTransparency={1}
		Text={props.text}
		TextScaled
		className="text-slate-100"
	/>
);

// A class list that only exists behind a call is the one shape this pass cannot
// read, so it is what keeps the runtime resolver — and the plugin table it reads
// — in the emit at all. Everything else here resolves at compile time.
const surfaceClass = (active: boolean) =>
	active ? "harness-card" : "harness-plate";

// The rem unit behind the same call, so the length is parsed by the runtime
// resolver rather than by the compiler.
const remClass = (active: boolean) =>
	active ? "w-[6rem] p-[0.5rem] text-[1.5rem]" : "w-[96px] p-[8px] text-[24px]";

// The same shape one level deeper, and behind a recipe rather than a literal.
const FadedCard = (props: { active: boolean; children?: React.Element }) => (
	<frame className={["bg-slate-700 size-8", props.active && "rounded-md"]}>
		<FadedLabel text="nested" />
		{props.children}
	</frame>
);

// Built where no fade is written, the way a caller hands a node over rather than
// writing it under one: a fragment reads no context of its own.
const handedDown = (
	<>
		<textlabel Text="handed down under a fragment" />
		<frame className="bg-white size-6" />
	</>
);

// A SurfaceGui is drawn on a part, at the pixel space that part gives it, so
// the curve is pinned under one: what is lowered here keeps its literal offsets,
// and the component below hears about the pin through the scope the emit opens
// around it.
export const SurfacePanel = () => (
	<surfacegui>
		<frame className="bg-slate-700 size-8 rounded-md p-2">
			<FadedLabel text="pinned" />
		</frame>
	</surfacegui>
);

// The same container handed a subtree its own file never saw. The caller built
// those instances against the viewport, and a fragment on the way down reads no
// context of its own, so the pin has to reach them after the fact.
export const SurfaceMount = (props: { children?: React.Element }) => (
	<surfacegui>{props.children}</surfacegui>
);

export const App = () => {
	const [active, setActive] = React.useState(false);
	const [roomy, setRoomy] = React.useState(false);

	React.useEffect(() => {
		// Yielding directly in the effect never returns, which wedges React's
		// commit phase and freezes every later state update.
		let running = true;
		task.spawn(() => {
			while (running) {
				task.wait(1);
				setActive((v) => !v);
				setRoomy((v) => !v);
			}
		});

		return () => {
			running = false;
		};
	}, []);

	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				className="grid rounded-md bg-slate-700 border border-slate-500 px-4 py-3 w-80 h-27 gap-4"
			>
				<textlabel
					BackgroundTransparency={1}
					Text="rbxts consumer harness"
					TextScaled
					TextWrapped
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="layout and spacing baseline"
					TextScaled
					TextWrapped
				/>
				<frame
					BackgroundTransparency={1}
					className={[
						"bg-blue-600 border-2 border-blue-600",
						active && "rounded-md",
					]}
				/>
				<frame
					BackgroundTransparency={1}
					className="rounded-md md:px-4 portrait:w-80 touch:px-3"
				/>
				<frame
					BackgroundTransparency={1}
					className={{ "px-4": roomy, "px-2": !roomy }}
				/>
				<frame BackgroundTransparency={1} className="rounded" />
				<frame
					BackgroundTransparency={1}
					className="tracking-wide checked:px-4 bg-[oops] blorb-2"
				/>
				<textbox BackgroundTransparency={1} className="placeholder-white/50" />
				<frame className="bg-gradient-to-r from-blue-600/50 to-rose-500 size-6" />
				<frame
					BackgroundTransparency={1}
					className="right-4 bottom-2 order-2 self-center content-between"
				/>
				<frame BackgroundTransparency={1} className="grid grid-cols-3 gap-2" />
				<frame
					BackgroundTransparency={1}
					className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 basis-1/2"
				/>
				<frame
					BackgroundTransparency={1}
					className="mx-auto pointer-events-none space-y-2 ring-2 ring-rose-500"
				/>
				<imagelabel BackgroundTransparency={1} className="object-cover" />
				<frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />
				<frame className="bg-slate-700 md:bg-blue-600 md:w-20 transition-colors size-6" />
				<frame className="bg-blue-600 animate-spin" />
				<frame className="bg-[#ff0000] size-6" />
				<frame className="bg-blue-600/50 hover:bg-blue-600 transition size-6" />
				<frame className="bg-slate-700 hover:bg-rose-500 transition duration-1000 ease-linear size-6" />
				<frame className="m-4 w-20 h-6 bg-slate-500 rounded-md" />
				<frame className="flex-col divide-y-2 divide-slate-500 w-20 h-12">
					<frame BackgroundTransparency={1} />
					<frame BackgroundTransparency={1} />
				</frame>
				<textlabel
					BackgroundTransparency={1}
					Text="static & <styled>"
					className="uppercase underline"
				/>
				<textlabel
					BackgroundTransparency={1}
					Text={roomy ? "roomy" : "tight"}
					className="capitalize line-through"
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="typography probe"
					className="leading-tight italic font-bold"
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="font family probe"
					className="font-mono"
				/>
				<canvasgroup className="opacity-50 size-6 bg-slate-700" />
				<frame className="opacity-50 size-6 bg-slate-700">
					<textlabel Text="faded with its parent" />
					<frame className="opacity-50 bg-white size-6" />
				</frame>
				{/* The component boundary, both ways: a fade written outside one
				    and a fade written on one. */}
				<frame className="opacity-50 size-8 bg-slate-700">
					<FadedLabel text="faded across the boundary" />
					<FadedCard active={active}>
						<textlabel Text="handed down as children" />
					</FadedCard>
				</frame>
				{/* The same boundary one fragment deeper: what the caller
				    built under one reads no context of its own. */}
				<frame className="opacity-50 size-8 bg-slate-700">
					<FadedCard active={active}>{handedDown}</FadedCard>
				</frame>
				<FadedLabel text="opaque control" />
				<FadedCard active={active} />
				<frame className={["size-8", active && "opacity-50"]}>
					<FadedLabel text="faded by a recipe" />
				</frame>
				<textbutton
					Text="press me"
					className="bg-slate-700 active:bg-blue-600 transition size-6"
				/>
				<frame className="bg-white dark:bg-slate-900 size-6" />
				<frame className="w-[120px] h-[50%] p-[7px] rounded-[10px] bg-slate-500" />
				{/* Directional radii: the left corners round, the right ones stay
				    square, and the variant repaints only what it names. */}
				<frame className="size-8 bg-slate-500 rounded-l-lg" />
				<frame className="size-8 bg-slate-500 rounded-l-lg hover:rounded-md" />
				<frame className="size-8 bg-slate-500 rounded-tr-[0.625rem]" />
				{/* The same box twice, once in rem and once in the pixels that rem
				    is worth at the base: they have to render identically. */}
				<frame className="w-[6rem] h-[1.5rem] p-[0.5rem] rounded-[0.25rem] border-[0.125rem] border-teal-200 bg-teal-500" />
				<frame className="w-[96px] h-[24px] p-[8px] rounded-[4px] border-[2px] border-teal-200 bg-teal-500" />
				<textlabel
					BackgroundTransparency={1}
					Text="arbitrary probe"
					className="text-[13px] leading-[1.6] z-[15]"
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="rem probe"
					className="text-[1.5rem] ring-[0.25rem] ring-teal-200"
				/>
				{/* The rem payload the runtime resolver parses rather than the emit. */}
				<textlabel
					Text="rem on the host"
					className={["h-6", remClass(active)]}
				/>
				<textbox
					PlaceholderText="type here"
					className="border border-slate-500 focus:border-blue-600 size-6"
				/>
				<frame className="harness-card size-8" />
				<frame className="harness-plate size-8" />
				<frame
					className={["size-8", active ? "harness-card" : "harness-plate"]}
				/>
				<frame className={["size-8", surfaceClass(active)]} />
				<scrollingframe className="scroll-y scrollbar-w-2 scrollbar-slate-500 canvas-auto-y w-20 h-12">
					<frame BackgroundTransparency={1} />
				</scrollingframe>
				{/* The variant-recipe shape: these classes only exist as a value, so
				    every family below has to resolve on the runtime path. */}
				<frame
					className={[
						"size-8 bg-slate-500",
						active && "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
					]}
				/>
				<frame className={["w-20 h-12", roomy && "grid grid-cols-3 gap-2"]} />
				<frame
					className={["h-6 bg-slate-700", active && "min-w-16 max-w-40"]}
				/>
				<frame
					className={[
						"size-8",
						active && "bg-gradient-to-r from-blue-600 to-rose-500",
					]}
				/>
				<frame
					className={["size-8", active && "ring-2 ring-rose-500 rounded-md"]}
				/>
				<frame
					className={[
						"size-8 bg-slate-700",
						active && "z-20 rotate-45 scale-110 opacity-75",
					]}
				/>
				<textlabel
					BackgroundTransparency={1}
					Text="dynamic text probe"
					className={[
						"text-sm",
						active && "text-lg text-slate-100 align-middle leading-snug italic",
					]}
				/>
				<scrollingframe
					className={[
						"w-20 h-12",
						active && "scroll-y scrollbar-w-2 canvas-auto-y",
					]}
				>
					<frame BackgroundTransparency={1} />
				</scrollingframe>
			</frame>
		</screengui>
	);
};
