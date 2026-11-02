---
"@rbxts/vela-runtime-core": minor
"@rbxts/vela-runtime": patch
"@rbxts/vela-runtime-vide": patch
---

Keep one environment store for the whole place in `@rbxts/vela-runtime-core`, read with `__VelaEnv.currentEnvironment()` and `__VelaEnv.subscribeEnvironment()`, so every runtime host shares one set of viewport, input, `LocalPlayer` and color scheme connections instead of connecting its own, and subscribers hear only changes that move a field resolution reads. The Vide host now follows input mode, the `VelaColorScheme` attribute and a `LocalPlayer` that arrives late, live, where it used to decide them at mount.
