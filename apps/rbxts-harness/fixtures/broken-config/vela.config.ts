import { defineConfig } from "vela-rbxts";

// `surface.raised` is not a shade, so this config cannot resolve. The harness
// test swaps in a valid one to prove the same project builds without it.
export default defineConfig({
	theme: {
		extend: {
			colors: { surface: { raised: "Color3.fromRGB(30, 30, 40)" } },
		},
	},
});
