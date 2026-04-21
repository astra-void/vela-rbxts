"use strict";

let nativeBinding;

try {
	nativeBinding = require("./index.js");
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	throw new Error(
		`Failed to load @rbxts-tailwind/compiler native entry (./index.js). Run \"pnpm --filter @rbxts-tailwind/compiler build:native\" first. Original error: ${message}`,
	);
}

module.exports = {};
module.exports.implementationKind = nativeBinding.implementationKind;
module.exports.transform = nativeBinding.transform;
