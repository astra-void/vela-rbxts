import { Players } from "@rbxts/services";
import Vide from "@rbxts/vide";
import { App } from "./App";
import { MarginTweenProbe } from "./MarginTween";

const localPlayer = Players.LocalPlayer;
if (!localPlayer) {
	error("LocalPlayer is required.");
}

const playerGuiInstance = localPlayer.WaitForChild("PlayerGui");
if (!playerGuiInstance.IsA("PlayerGui")) {
	error("PlayerGui instance is required.");
}

Vide.mount(() => App(), playerGuiInstance);
Vide.mount(() => MarginTweenProbe(), playerGuiInstance);
