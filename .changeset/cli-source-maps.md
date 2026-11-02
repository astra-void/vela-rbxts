---
"vela-rbxts": minor
"@vela-rbxts/compiler": minor
"@vela-rbxts/rbxtsc-host": minor
---

The CLI writes a source map for every lowered file under `.vela/maps`, and `vela rbxtsc` and `vela remap` rewrite rbxtsc diagnostics against `.vela/src` so they point at the line and column in `src` where the code was written, with the code frame re-rendered from the original line. The compiler takes a `sourceMap` option and returns the mappings it recorded, and a file the compiler leaves unchanged is now copied through as written instead of reprinted.
