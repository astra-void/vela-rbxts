import { defineConfig } from "rbxts-tailwind";

export default defineConfig({
	theme: {
		colors: {
			surface: "Color3.fromRGB(40, 48, 66)",
		},
		radius: {
			md: "new UDim(0, 8)",
		},
		spacing: {
			"4": "new UDim(0, 12)",
		},
	},
});
