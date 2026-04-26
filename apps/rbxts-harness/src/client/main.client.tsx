import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "./App";

const localPlayer = Players.LocalPlayer;
if (!localPlayer) {
	error("LocalPlayer is required.");
}

const playerGuiInstance = localPlayer.WaitForChild("PlayerGui");
if (!playerGuiInstance.IsA("PlayerGui")) {
	error("PlayerGui instance is required.");
}
const root = ReactRoblox.createRoot(playerGuiInstance);
root.render(<App />);
