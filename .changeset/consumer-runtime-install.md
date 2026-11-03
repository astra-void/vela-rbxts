---
"vela-rbxts": patch
"@vela-rbxts/rbxtsc-host": patch
---

Fail the build when the runtime a lowered file imports cannot load from the project's `node_modules/@rbxts`, instead of building a place that stops on play with "Could not find module: vela-runtime-core". The runtimes are dependencies of `vela-rbxts`, and pnpm's default linker keeps a dependency's own dependencies out of that folder, which is all Rojo maps into the place. Both the `rbxtsc` plugin and `vela build` now walk the imported runtime's `@rbxts` dependencies from the nearest `package.json` and fail the file with `runtime-not-installed`, naming each missing package and the package that needs it, or a runtime package installed at another version than the compiler emits for. Before, the default pnpm install failed with a bare `Cannot find module '@rbxts/vela-runtime'`, and adding that package by hand compiled a place without its core. The README now gives pnpm projects `publicHoistPattern: ["*@rbxts*"]` in `pnpm-workspace.yaml`, the setting `@rbxts/react` already asks them for.
