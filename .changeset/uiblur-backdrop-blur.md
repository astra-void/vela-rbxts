---
"@vela-rbxts/compiler": minor
"@rbxts/vela-runtime": minor
"@rbxts/vela-runtime-core": minor
"vela-rbxts": minor
---

Lower `backdrop-blur-*` to Roblox's `UIBlur`, mapping Tailwind's sizes onto its three strengths, and name `UIShadow` and `UIBlur` by their real class on the static React path so a statically lowered shadow no longer fails `Instance.new` on its lowercase tag.
