import { Players } from "@rbxts/services";
import Vide from "@rbxts/vide";
import { App } from "./App";
import { DivideGapProbe } from "./DivideGapProbe";
import { MarginTweenProbe } from "./MarginTween";
import { RelationalAttributeProbe } from "./RelationalAttributeProbe";

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
Vide.mount(() => DivideGapProbe({ gap: "gap-4" }), playerGuiInstance);
Vide.mount(() => RelationalAttributeProbe(), playerGuiInstance);
