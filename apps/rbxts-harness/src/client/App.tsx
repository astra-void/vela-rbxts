import React from "@rbxts/react";

export const App = () => {
	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				className="rounded-md px-4 bg-surface w-80 h-27"
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
