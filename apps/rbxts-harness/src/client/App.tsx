import React from "@rbxts/react";

export const App = () => {
	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				className="rounded-md bg-surface px-4 py-3 w-80 h-27 gap-4"
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
			</frame>
		</screengui>
	);
};
