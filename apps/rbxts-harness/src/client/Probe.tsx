import React from "@rbxts/react";
import { Workspace } from "@rbxts/services";

const anchor = new Instance("Part");
anchor.Name = "VelaBillboardAnchor";
anchor.Anchored = true;
anchor.Size = new Vector3(2, 2, 2);
anchor.Position = new Vector3(0, 8, -12);
anchor.Parent = Workspace;

const STRIPES = [
	Color3.fromRGB(239, 68, 68),
	Color3.fromRGB(250, 204, 21),
	Color3.fromRGB(34, 197, 94),
	Color3.fromRGB(59, 130, 246),
	Color3.fromRGB(168, 85, 247),
	Color3.fromRGB(15, 23, 42),
];

const stripes = STRIPES.map((color, index) => (
	<frame
		key={`Stripe${index}`}
		BackgroundColor3={color}
		BorderSizePixel={0}
		Position={UDim2.fromScale(index / STRIPES.size(), 0)}
		Size={UDim2.fromScale(1 / STRIPES.size(), 1)}
	/>
));

export const Probe = () => (
	<>
		<screengui
			key="VelaProbe"
			IgnoreGuiInset={true}
			DisplayOrder={100}
			ZIndexBehavior={Enum.ZIndexBehavior.Sibling}
		>
			<frame
				key="Backdrop"
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
			>
				{stripes}
			</frame>
			<frame
				key="Blur"
				Position={UDim2.fromOffset(40, 40)}
				Size={UDim2.fromOffset(260, 160)}
				ZIndex={2}
				className="bg-white/20 backdrop-blur-xl rounded-lg"
			/>
			<frame
				key="NoBlur"
				Position={UDim2.fromOffset(340, 40)}
				Size={UDim2.fromOffset(260, 160)}
				ZIndex={2}
				className="bg-white/20 rounded-lg"
			/>
			<frame
				key="Layers"
				Position={UDim2.fromOffset(40, 260)}
				Size={UDim2.fromOffset(260, 160)}
				ZIndex={2}
				className="bg-slate-200 rounded-lg shadow-2xl inset-shadow-sm inset-shadow-black/60"
			/>
			<textlabel
				key="TextShadow"
				Position={UDim2.fromOffset(340, 260)}
				Size={UDim2.fromOffset(260, 160)}
				ZIndex={2}
				Text="Shadow"
				className="bg-slate-200 rounded-lg text-6xl text-white font-bold text-shadow-lg text-shadow-black/40"
			/>
			<frame
				key="Scaled"
				Position={UDim2.fromOffset(640, 40)}
				ZIndex={2}
				className="w-32 h-16 bg-red-500"
			/>
		</screengui>
		<billboardgui
			key="VelaBillboard"
			Adornee={anchor}
			Size={UDim2.fromOffset(300, 200)}
			AlwaysOnTop={true}
		>
			<frame key="Pinned" className="w-32 h-16 p-2 bg-red-500 rounded-md" />
		</billboardgui>
	</>
);
