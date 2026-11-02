---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
"@rbxts/vela-runtime": minor
"@rbxts/vela-runtime-core": minor
"@rbxts/vela-runtime-vide": minor
"vela-rbxts": minor
---

Rank the children of a `divide-*` list by their `LayoutOrder` or static `order-*` so the separators follow the sorted order on both hosts, fade the separators with `opacity-*`, keep the separators of a divided list whose value children sit under a fade, and make `divide-x-0`/`divide-y-0` remove them. The compiler warns when divide has no list layout, sits beside `grid`, or has a child whose `order-*` the React parent cannot read. Add `isolate`, which builds a `frame` as a `canvasgroup` so `opacity-*` fades its subtree as one layer; it has to be static and unconditional. `@rbxts/vela-runtime-core` gains `__VelaDivide.planDivideOrder` and `__VelaDivide.separatorTransparency`.
