import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App, SurfaceMount } from "./App";
import { MarginTweenProbe } from "./MarginTween";
import { DivideGapProbe } from "./DivideGapProbe";
import { Probe } from "./Probe";

const localPlayer = Players.LocalPlayer;
if (!localPlayer) {
	error("LocalPlayer is required.");
}

const playerGuiInstance = localPlayer.WaitForChild("PlayerGui");
if (!playerGuiInstance.IsA("PlayerGui")) {
	error("PlayerGui instance is required.");
}
// Built here rather than under the container, the way a mount function is handed
// what it portals: these offsets are lowered against the viewport, and only the
// pin at render puts them back.
const surfaceChildren = (
	<>
		<frame className="bg-slate-700 size-8 rounded-md p-2" />
		<textlabel BackgroundTransparency={1} Text="pinned" className="text-sm" />
	</>
);

const root = ReactRoblox.createRoot(playerGuiInstance);
root.render(
	<>
		<App />
		<SurfaceMount>{surfaceChildren}</SurfaceMount>
		<Probe />
		<MarginTweenProbe />
		<DivideGapProbe gap="gap-4" />
	</>,
);
