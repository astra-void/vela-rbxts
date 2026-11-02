---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
---

Warn in the editor about a class that later classes override. `bg-red-500 bg-blue-500`, `px-2 p-4` and `hover:bg-red-500 hover:bg-blue-500` now flag the first class as `overridden-class`, naming the class that wins, while partial overlaps such as `p-4 px-2` or `w-4 h-8` and classes under different conditions stay quiet. An element's subtree fade and a divide color count, so `opacity-50 opacity-75` and `divide-y divide-red-500/50 divide-blue-500` warn too. The check runs the compiler's own resolver with and without each class, so it agrees with what the build emits. The language server marks the class as unnecessary and offers only its removal. Builds do not report it.
