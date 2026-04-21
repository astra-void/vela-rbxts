import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import { App } from "./App";

const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
const root = ReactRoblox.createRoot(playerGui);

// TODO: When rbxtsc transformer lifecycle wiring is ready, attach
// @rbxts-tailwind/rbxtsc-host in the compile pipeline so className
// is transformed before runtime while semantic execution stays in
// @rbxts-tailwind/compiler.
root.render(React.createElement(App));
