---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime-vide": patch
---

On the Vide target, a statically lowered element no longer crashes the whole tree when it is built inside a function child. Its rem-scaled offsets used to be emitted as one reactive prop each, and Vide refuses to open a prop effect inside the children effect a function child runs in, so `{() => items.map((item) => <frame className="w-6 h-6" />)}` threw "cannot create a new reactive scope inside another reactive scope" out of `Vide.root`. The offsets now travel as one `__VelaRem.bind({ ... })` action child per instance, which opens its effect untracked: it still follows the viewport, and it is owned by and torn down with the function child that built it. An element whose class is followed by a spread keeps a binding per prop, so the spread can still paint over it. The element's own `action` is moved behind the binding, so it still runs after Vela's and reads the offsets already scaled.
