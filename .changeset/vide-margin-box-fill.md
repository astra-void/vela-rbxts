---
"@rbxts/vela-runtime-vide": patch
---

On Vide, an `m-*` element whose size comes from a class value resolved at runtime now fills its margin box. The host only made the element fill the box when its size was already a static prop when the host was built, so `className={() => "m-4 w-20 h-10"}` sized the box while the element inside stayed 0×0, and the box kept hugging its contents and grew past the size it was given. The element now fills a box the resolution sizes and falls back when nothing does, and a sized box stops sizing itself to its contents, as the React host already did.
