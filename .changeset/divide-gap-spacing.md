---
"@vela-rbxts/compiler": minor
"@rbxts/vela-runtime": minor
"@rbxts/vela-runtime-core": minor
"@rbxts/vela-runtime-vide": minor
"vela-rbxts": minor
---

Space a divided list's items `gap + thickness` apart, as CSS does, instead of `2 * gap + thickness`. The separators were list items, so the list's `Padding` opened on both sides of each one. Now the host sets that `Padding` to 0 and each separator takes the gap itself: a transparent slot `thickness + gap` long holding a `Line` frame at its start, against the item before as Tailwind's border is. `gap-*`, `space-*`, a variant gap such as `hover:gap-4` and a gap from a runtime class value all move this way on both hosts. A gap stays on the list when the separators cross it, and a `Padding` written on your own `<uilistlayout>` is left as written. To make that possible the compiler emits the `uilistlayout` of an element a divide can reach as an unconditional rule rather than a child. In `@rbxts/vela-runtime-core`, `__VelaDivide.separatorSize` now returns the slot, `__VelaDivide.separatorLineSize` returns the line, and `__VelaDivide.absorbListGap` moves the gap.
