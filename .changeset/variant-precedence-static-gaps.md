---
"@vela-rbxts/compiler": patch
"@vela-rbxts/lsp": patch
"@rbxts/vela-runtime-core": patch
"@rbxts/vela-runtime-vide": patch
---

Rank what applies the way Tailwind's stylesheet does on both paths: a matching variant beats the base wherever it is written, a wider breakpoint beats a narrower one, orientation, `dark:` and the input variants beat every breakpoint, and the last class wins among equal conditions. On the static path, margin, divide, text transform and decoration, transition and animation classes under a variant are forwarded to the runtime host instead of being dropped, a variant `opacity-*` on a component element applies and a hosted component keeps its own and inherited alpha, a grid takes its gap as `CellPadding` without a second `UIListLayout`, a variant position, translate or automatic size names one axis at a time, and the base's translate and negative margin go to the runtime once a rule moves the element. The overridden-class warning reads forwarded classes under the condition they were written with.
