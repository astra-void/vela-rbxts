# @vela-rbxts/config

Config schema, built-in theme defaults, and the `defineConfig()`, `definePreset()`, and `plugin()` helpers for [`vela-rbxts`](https://github.com/astra-void/vela-rbxts).

It owns the resolution order every consumer reads a config through (built-in defaults, then `presets` in the order written, then the config itself) and the vocabulary a variant prefix is checked against, so a plugin cannot register a name the compiler already reads as something else.

Re-exported by `vela-rbxts`. Install [`vela-rbxts`](https://www.npmjs.com/package/vela-rbxts) instead of depending on this package directly.

## License

MIT
