import Vide from "@rbxts/vide";

/// group-* and peer-* over attribute variants: set `Selected` or `State` on the
/// card, or `Selected` or `Tier` on either tab, and read the label beside them.
export function RelationalAttributeProbe() {
	return (
		<screengui
			Name="VelaRelationalAttributeProbe"
			ResetOnSpawn={false}
			IgnoreGuiInset={true}
			DisplayOrder={101}
		>
			<frame
				Name="Root"
				Position={UDim2.fromOffset(40, 460)}
				className="flex-col gap-2 p-2 bg-slate-950 w-64"
			>
				<frame
					Name="GroupAttrCard"
					className="group/card w-60 h-8 bg-slate-800"
				>
					<textlabel
						Name="GroupAttrLabel"
						Text="group"
						className="w-60 h-8 bg-slate-700 text-slate-400 group-selected/card:text-blue-400 group-attr-[State=open]/card:bg-rose-500"
					/>
				</frame>
				<frame Name="PeerAttrRow" className="flex-row gap-1 w-60 h-8">
					<frame
						Name="PeerAttrFirst"
						className="peer/tab w-12 h-8 bg-slate-800"
					/>
					<frame
						Name="PeerAttrSecond"
						className="peer/tab w-12 h-8 bg-slate-800"
					/>
					<textlabel
						Name="PeerAttrHint"
						Text="peer"
						className="w-24 h-8 bg-slate-700 text-slate-400 peer-selected/tab:text-blue-400 peer-attr-[Tier=2]/tab:bg-rose-500"
					/>
				</frame>
			</frame>
		</screengui>
	);
}
