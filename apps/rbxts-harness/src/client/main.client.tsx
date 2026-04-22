import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import { Players } from "@rbxts/services";
import type {} from "rbxts-tailwind";
import { App } from "./App";

const playerGui = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
const root = ReactRoblox.createRoot(playerGui);

root.render(React.createElement(App));
