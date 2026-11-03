---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime": patch
"@rbxts/vela-runtime-vide": patch
---

A transparency written on an element now survives a fade that arrives at runtime, as it already did under a fade the compiler could see. `<frame BackgroundTransparency={0.2} />` inside a component rendered with `opacity-50` kept its 0.2 when the fade was composed statically, but became 0.6 when the same fade crossed the component boundary through the opacity context, because the runtime could not tell a prop the author wrote from one Vela lowered. The compiler now wraps such an element in `__VelaOpacity.own(element, names)` and hands a runtime host the names as `__velaOwn`, and both the React and the Vide consumer leave those props standing. A literal `1` is left unwrapped, since a fade composes it to itself.
