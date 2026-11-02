---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
"@vela-rbxts/config": minor
"@rbxts/vela-runtime-core": minor
"@rbxts/vela-runtime": minor
"@rbxts/vela-runtime-vide": minor
"@vela-rbxts/ir": minor
---

Add `group-hover:`, `group-active:`, `group-focus:` and the matching `peer-*` variants, each with an optional `/name`, and the `group`, `group/name`, `peer` and `peer/name` markers. A marker lowers to a CollectionService tag (`VelaGroup`, `VelaPeer/name`), carried by `Tag` on a static React element and placed by the host on Vide, and a shared runtime-core observer finds the nearest marked ancestor or any marked sibling and reports its hover, press and focus. Peers ignore sibling order, which Roblox does not keep, and look past the `VelaMarginBox` frame an `m-*` element is wrapped in. `group-md:` and other unread states warn `unsupported-relational-variant`, and a conditional marker or one on a component element warns too. `group`, `peer`, `group-*` and `peer-*` are now reserved variant names.
