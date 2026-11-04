---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
---

An arbitrary value that lowers exactly as a named class, such as `w-[16px]` for `w-4` or `px-[18px]` for a theme's `px-card`, now gets a `canonical-class` info diagnostic with a quickfix to the named form. Equivalence is decided by the compiler's resolver on the element's host with the variants kept. `EditorDiagnostic` gains an optional `replacement`, which the LSP carries in the diagnostic's data.
