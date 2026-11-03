---
"@vela-rbxts/compiler": patch
---

A `const` string used as a class value now lowers its classes. `const item = "w-6 bg-slate-500"; <frame className={item} />` used to emit only preflight's defaults, because the compiler kept nothing about a `const` but whether it was truthy, which is all a condition such as `on && "x"` needs. It now keeps a string literal's text as well, so the identifier lowers exactly as the string would.
