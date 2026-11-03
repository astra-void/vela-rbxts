import React from "@rbxts/react";

/// group-* and peer-* over attribute variants: set `Selected` or `State` on the
/// card, or `Selected` or `Tier` on either tab, and read the label beside them.
export const RelationalAttributeProbe = () => (
	<screengui
		key="VelaRelationalAttributeProbe"
		ResetOnSpawn={false}
		IgnoreGuiInset={true}
		DisplayOrder={101}
	>
		<frame
			key="Root"
			Position={UDim2.fromOffset(40, 460)}
			className="flex-col gap-2 p-2 bg-slate-950 w-64"
		>
			<frame key="GroupAttrCard" className="group/card w-60 h-8 bg-slate-800">
				<textlabel
					key="GroupAttrLabel"
					Text="group"
					className="w-60 h-8 bg-slate-700 text-slate-400 group-selected/card:text-blue-400 group-attr-[State=open]/card:bg-rose-500"
				/>
			</frame>
			<frame key="PeerAttrRow" className="flex-row gap-1 w-60 h-8">
				<frame key="PeerAttrFirst" className="peer/tab w-12 h-8 bg-slate-800" />
				<frame
					key="PeerAttrSecond"
					className="peer/tab w-12 h-8 bg-slate-800"
				/>
				<textlabel
					key="PeerAttrHint"
					Text="peer"
					className="w-24 h-8 bg-slate-700 text-slate-400 peer-selected/tab:text-blue-400 peer-attr-[Tier=2]/tab:bg-rose-500"
				/>
			</frame>
		</frame>
	</screengui>
);
