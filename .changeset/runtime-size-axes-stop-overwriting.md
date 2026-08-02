---
"@vela-rbxts/compiler": patch
---

Keep `w-*` and `h-*` from erasing each other on the runtime path. `Size` holds
both axes, so a bundle that named one of them used to state a whole `UDim2` and
zero out the other — `md:w-32 md:h-32` kept only the height, and a `md:h-32`
overlay dropped the base width. Variant rules and dynamic class values now carry
each axis on its own, and the runtime composes them over whatever `Size` the
element already has, so a variant only moves the axis it names.
