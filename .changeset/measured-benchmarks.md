---
"@rbxts/vela-runtime-core": minor
---

Add `__VelaEnv.listenerCount()`, a read-only count of the environment store's listeners, for the new Studio benches and specs: Roblox exposes no count of signal connections, so this is the one metric that shows how hosts share the store. The repository also gains criterion benches for the compiler, a vitest bench for the rbxtsc host, an end-to-end `rbxtsc` build overhead script, and a bench place in both harnesses.
