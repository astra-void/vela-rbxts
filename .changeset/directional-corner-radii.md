---
"@vela-rbxts/compiler": minor
"@rbxts/vela-runtime-core": minor
---

Add directional corner radius utilities, including theme keys and arbitrary values such as `rounded-l-lg`, `rounded-l-[10%]`, `rounded-r-[7px]`, and `rounded-tr-[0.625rem]`. A per-corner utility writes the individual `UICorner` radius properties and squares off the corners it does not name, so it beats the order-dependent `CornerRadius` shorthand however the two are written. A variant still repaints the corners the base left open, as `rounded-l-lg hover:rounded-md` does.
