import Vide from "@rbxts/vide";

const item = "w-6 h-6 bg-slate-500";
const bar = "w-24 h-4 bg-slate-500";

/// Each divided list spaces two items `gap + thickness` apart, as CSS does,
/// rather than taking the gap on both sides of every separator.
export function DivideGapProbe(props: { ghost?: boolean; gap?: string }) {
	return (
		<screengui
			Name="VelaDivideGapProbe"
			IgnoreGuiInset={true}
			DisplayOrder={101}
			ResetOnSpawn={false}
		>
			<frame
				Name="Rows"
				Position={UDim2.fromOffset(640, 40)}
				className="flex-col gap-4 w-48 h-96"
			>
				<frame
					Name="GapRow"
					LayoutOrder={1}
					className="flex flex-row gap-4 divide-x-2 divide-rose-500 h-6"
				>
					<frame Name="a" className={item} />
					<frame Name="b" className={item} />
					<frame Name="c" className={item} />
				</frame>
				<frame
					Name="GapColumn"
					LayoutOrder={2}
					className="flex-col gap-2 divide-y divide-slate-300 w-24"
				>
					<frame Name="a" className={bar} />
					<frame Name="b" className={bar} />
					<frame Name="c" className={bar} />
				</frame>
				<frame
					Name="SpaceColumn"
					LayoutOrder={3}
					className="space-y-2 divide-y divide-slate-300 w-24"
				>
					<frame Name="a" className={bar} />
					<frame Name="b" className={bar} />
				</frame>
				<frame
					Name="VariantRow"
					LayoutOrder={4}
					className="flex flex-row gap-2 attr-[Wide=true]:gap-4 divide-x-2 divide-rose-500 h-6"
				>
					<frame Name="a" className={item} />
					<frame Name="b" className={item} />
				</frame>
				{/* A thunk that renders nothing leaves a spare separator, hidden. */}
				<frame
					Name="ConditionalRow"
					LayoutOrder={5}
					className="flex flex-row gap-4 divide-x-2 divide-rose-500 h-6"
				>
					{() =>
						props.ghost ? (
							<frame Name="ghost" Size={UDim2.fromOffset(24, 24)} />
						) : undefined
					}
					<frame Name="a" className={item} />
					<frame Name="b" className={item} />
				</frame>
				<frame
					Name="DynamicRow"
					LayoutOrder={6}
					className={[
						"flex flex-row divide-x-2 divide-rose-500 h-6",
						props.gap,
					]}
				>
					<frame Name="a" className={item} />
					<frame Name="b" className={item} />
				</frame>
			</frame>
		</screengui>
	);
}
