---
"vela-rbxts": minor
"@vela-rbxts/rbxtsc-host": minor
---

`vela watch` rebuilds when a stylesheet pulled in with `@import` changes, wherever it lives, outside the project root and `src` included, and follows an import added while the watch runs. It polls a directory it cannot watch. `@vela-rbxts/rbxtsc-host` exports `projectConfigDependencies`, the files a project's config was folded from.
