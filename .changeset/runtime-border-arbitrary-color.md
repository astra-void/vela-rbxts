---
"@rbxts/vela-runtime-core": patch
---

Resolve `border-[#hex]` and `border-red-500/50` on the runtime path. The in-game parser still refused every bracketed border payload and every slash, rules the compiler had dropped, so a border color that reached it through a dynamic `className` was discarded and the `UIStroke` kept Roblox's default black.
