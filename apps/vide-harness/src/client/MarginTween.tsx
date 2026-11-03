import Vide from "@rbxts/vide";

// The margin box carries the element's Size, so the width has to tween on the
// box rather than snap. A slow linear tween reads apart from a snap at ~15fps.
export function MarginTweenProbe() {
	const wide = Vide.source(false);

	task.spawn(() => {
		while (true) {
			task.wait(3);
			wide(!wide());
		}
	});

	return (
		<screengui
			Name="VelaMarginTween"
			ResetOnSpawn={false}
			IgnoreGuiInset={true}
			DisplayOrder={101}
		>
			<frame
				Name="MarginTweenProbe"
				Position={UDim2.fromOffset(40, 480)}
				className={() =>
					wide()
						? "m-4 w-40 h-10 bg-rose-500 transition-all duration-1000 ease-linear"
						: "m-4 w-20 h-10 bg-rose-500 transition-all duration-1000 ease-linear"
				}
			/>
		</screengui>
	);
}
