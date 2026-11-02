---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
"@rbxts/vela-runtime": minor
"@rbxts/vela-runtime-vide": minor
---

Let a prop written on an element outrank every class that names it, under every condition. The compiler no longer emits a class's copy beside a declared prop, where JSX let the class's later attribute win and replace a reactive binding: it drops the prop from the base, from variants and from class branches, and warns `explicit-prop-overrides-class` naming the class and the prop, in builds and in the editor. A class value resolved at render time is handed the declared names as `__velaOwn`, and both runtime hosts leave those props standing. A helper written as a child, a fragment's child included, outranks the class's (`explicit-helper-overrides-class`), except a `UIShadow` layer; a conditional child or a helper a variant changes is kept and reported as `possible-duplicate-helper`. Beside a spread, what a class lowers to now takes the `className`'s place and preflight's defaults go first, so `<frame className="bg-slate-700" {...props} />` lets `props` win and a spread can paint over preflight; move the `className` after the spread to keep the class winning.
