import { defineConfig, definePreset, plugin } from "vela-rbxts";

// A preset written inline rather than imported: the harness has no package to
// pull one from, and what is being exercised is the merge order, not npm.
const harnessPreset = definePreset({
	theme: {
		extend: {
			colors: { brand: "Color3.fromRGB(255, 136, 0)" },
			screens: { tablet: 900 },
		},
	},
	plugins: [
		plugin(({ addUtilities, addVariant }) => {
			addUtilities({ "preset-badge": "bg-brand rounded-md" });
			addVariant("open", { attribute: "State", equals: "open" });
			// Overridden below, which is what makes the order observable.
			addVariant("selected", { attribute: "PresetSelected", equals: true });
		}),
	],
});

export default defineConfig({
	presets: [harnessPreset],
	plugins: [
		plugin(({ addVariant }) => {
			addVariant("selected", { attribute: "Selected", equals: true });
			addVariant("tier", { attribute: "Tier", equals: 2 });
		}),
	],
});
