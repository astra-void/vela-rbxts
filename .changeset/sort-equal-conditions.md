---
"@vela-rbxts/compiler": patch
"@vela-rbxts/lsp": patch
---

Sort a variant chain as the set of conditions it names, so `hover:md:bg-red-500 md:hover:bg-blue-500` keeps its order and the class that wins under that condition stays the same, while a chain still sorts after a shorter chain it extends, such as `dark:hover:` after `dark:`.
