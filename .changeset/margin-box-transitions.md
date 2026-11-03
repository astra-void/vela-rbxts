---
"@rbxts/vela-runtime": patch
"@rbxts/vela-runtime-core": minor
"@rbxts/vela-runtime-vide": patch
---

Tween the layout props an `m-*` element's margin box carries instead of snapping them, so `<frame className="m-4 w-20 transition-all hover:w-40" />` widens the box, margin included, on both hosts. A motion driver receives those tweens with `{ owner, marginBox: true }` as its fourth argument. `@rbxts/vela-runtime-core` gains `__VelaMotion.holdTweenGoal` and `__VelaMotion.changedGoal`.
