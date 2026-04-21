import React from "@rbxts/react";

const theme = {
	colors: {
		surface: Color3.fromRGB(40, 48, 66),
	},
	radius: {
		md: new UDim(0, 8),
	},
	spacing: {
		4: new UDim(0, 12),
	},
} as const;

export const App = () => {
	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				Size={new UDim2(0, 320, 0, 108)}
				className="rounded-md px-4 bg-surface"
			>
				<textlabel
					BackgroundTransparency={1}
					Size={UDim2.fromScale(1, 1)}
					Text="rbxts consumer harness"
					TextScaled
					TextWrapped
				/>
			</frame>
		</screengui>
	);
};
