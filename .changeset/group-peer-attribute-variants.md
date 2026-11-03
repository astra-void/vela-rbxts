---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
"@rbxts/vela-runtime-core": minor
---

Read attribute variants through `group-*` and `peer-*`: `group-selected:` for a variant registered with `addVariant` or `@custom-variant`, and `group-attr-[State=open]/card:` or `peer-attr-[Tier=2]:` inline, each with the same optional `/name`. A slash inside the brackets stays part of the value. The shared runtime-core observer reads each attribute off the group or peer when it finds it and connects one `GetAttributeChangedSignal` per attribute per observed instance however many elements read it; a peer variant matches while any marked sibling carries the value. `group-md:` and other environment states still warn `unsupported-relational-variant`, and a malformed `group-attr-[…]` warns `malformed-attribute-variant`. The editor completes `group-<variant>:`, `group-attr-[` and their `peer-*` forms, hovers them, and sorts them after the interaction states of the same marker. `@rbxts/vela-runtime-core` gains `__VelaScope.watchedAttributeCount()` for the bench specs.
