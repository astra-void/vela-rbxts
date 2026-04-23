"use strict";

let nativeBinding;

try {
	nativeBinding = require("./index.js");
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	throw new Error(
		`Failed to load @vela-rbxts/compiler native entry (./index.js). Run \"pnpm --filter @vela-rbxts/compiler build:native\" first. Original error: ${message}`,
	);
}

module.exports = {};
module.exports.implementationKind = nativeBinding.implementationKind;
module.exports.transform = nativeBinding.transform;
module.exports.getCompletions = nativeBinding.getCompletions;
module.exports.getHover = nativeBinding.getHover;
module.exports.getDiagnostics = nativeBinding.getDiagnostics;
