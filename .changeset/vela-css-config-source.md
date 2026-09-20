---
"@vela-rbxts/config": minor
"@vela-rbxts/rbxtsc-host": minor
"vela-rbxts": minor
---

Configure a project from a `vela.css`. `@theme` declares tokens with CSS values (`--color-brand-500: #3b82f6`, `--spacing-4: 16px`), `@custom-variant selected (Selected = true)` registers an attribute-backed variant, `.btn { @apply … }` and `.panel { BackgroundTransparency: 0.5 }` register plugin utilities, and `@import "./tokens.css"` folds a sibling stylesheet in as a preset of the file that named it. The stylesheet only ever extends, so it resolves on top of a `vela.config.ts` when a project has both, and a project that has only the stylesheet needs no config file at all. What the dialect does not have is a cascade: combinators, pseudo-classes, `@media`, and CSS properties are diagnosed with the vela equivalent rather than silently accepted.
