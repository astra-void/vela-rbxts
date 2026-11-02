---
"@vela-rbxts/compiler": patch
"@rbxts/vela-runtime-core": patch
"@rbxts/vela-runtime-vide": patch
---

Make the runtime path resolve a class the way the static path lowers it: an element's own `opacity-*` multiplies into every channel and the stroke, shadow and blur it draws once every token has resolved, negative margins replace rather than accumulate, a variant `max-w-*` keeps its other axis unbounded, and a solid color takes back an earlier color's `/N`. On the static path, an all-zero margin no longer promotes an element to the runtime host, a variant `opacity-*` hands its alpha to the runtime to compose over every rule that fires beside it, and a variant font utility keeps the family and weight the base set. On both paths, `opacity-*` leaves a background preflight neutralized transparent. The Vide host puts a helper property back to its default when no rule names it any more.
