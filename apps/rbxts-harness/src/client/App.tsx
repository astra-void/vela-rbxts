import React from "@rbxts/react";

export const App = () => {
	const [active, setActive] = React.useState(false);
	const [roomy, setRoomy] = React.useState(false);

	React.useEffect(() => {
		while (true) {
			task.wait(1);
			setActive((v) => !v);
			setRoomy((v) => !v);
		}
	}, []);

	return (
		<screengui ResetOnSpawn={false} IgnoreGuiInset>
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={UDim2.fromScale(0.5, 0.5)}
				className="rounded-md bg-slate-700 px-4 py-3 w-80 h-27 gap-4"
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
					className={["bg-blue-600", active && "rounded-md"]}
				/>
				<frame
					BackgroundTransparency={1}
					className="rounded-md md:px-4 portrait:w-80 touch:px-3"
				/>
				<frame
					BackgroundTransparency={1}
					className={{ "px-4": roomy, "px-2": !roomy }}
				/>
			</frame>
		</screengui>
	);
};
