---
"vela-rbxts": minor
"@vela-rbxts/rbxtsc-host": minor
---

Add `vela sort [paths...]`, which applies the editor's class sort to every `.tsx` file under `--src` or the paths given, and `vela sort --check`, which lists the files that would change and exits 1 without writing, for CI and pre-commit hooks. `--class-functions cn,cva` sorts the same helpers as the editor's `classFunctions`. `@vela-rbxts/rbxtsc-host` exports the `sortSourceForHost` it is built on.
