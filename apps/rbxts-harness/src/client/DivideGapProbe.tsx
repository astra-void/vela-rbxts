import React from "@rbxts/react";

const item = "w-6 h-6 bg-slate-500";
const bar = "w-24 h-4 bg-slate-500";

// Each divided list spaces two items `gap + thickness` apart, as CSS does,
// rather than taking the gap on both sides of every separator.
export const DivideGapProbe = (props: { ghost?: boolean; gap?: string }) => (
	<screengui
		key="VelaDivideGapProbe"
		IgnoreGuiInset={true}
		DisplayOrder={101}
		ResetOnSpawn={false}
	>
		<frame
			key="Rows"
			Position={UDim2.fromOffset(640, 40)}
			className="flex-col gap-4 w-48 h-96"
		>
			<frame
				key="GapRow"
				LayoutOrder={1}
				className="flex flex-row gap-4 divide-x-2 divide-rose-500 h-6"
			>
				<frame key="a" className={item} />
				<frame key="b" className={item} />
				<frame key="c" className={item} />
			</frame>
			<frame
				key="GapColumn"
				LayoutOrder={2}
				className="flex-col gap-2 divide-y divide-slate-300 w-24"
			>
				<frame key="a" className={bar} />
				<frame key="b" className={bar} />
				<frame key="c" className={bar} />
			</frame>
			<frame
				key="SpaceColumn"
				LayoutOrder={3}
				className="space-y-2 divide-y divide-slate-300 w-24"
			>
				<frame key="a" className={bar} />
				<frame key="b" className={bar} />
			</frame>
			<frame
				key="VariantRow"
				LayoutOrder={4}
				className="flex flex-row gap-2 attr-[Wide=true]:gap-4 divide-x-2 divide-rose-500 h-6"
			>
				<frame key="a" className={item} />
				<frame key="b" className={item} />
			</frame>
			<frame
				key="ConditionalRow"
				LayoutOrder={5}
				className="flex flex-row gap-4 divide-x-2 divide-rose-500 h-6"
			>
				{props.ghost && <frame key="ghost" className={item} />}
				<frame key="a" className={item} />
				<frame key="b" className={item} />
			</frame>
			<frame
				key="DynamicRow"
				LayoutOrder={6}
				className={["flex flex-row divide-x-2 divide-rose-500 h-6", props.gap]}
			>
				<frame key="a" className={item} />
				<frame key="b" className={item} />
			</frame>
		</frame>
	</screengui>
);
