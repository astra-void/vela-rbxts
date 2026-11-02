---
"vela-rbxts": minor
"@vela-rbxts/rbxtsc-host": minor
---

Fail the build when Vela fails, instead of shipping the file unlowered. A host result now carries `fatal`, set whenever a diagnostic is an error, and neither the `rbxtsc` plugin nor `vela build` emits such a file: the plugin keeps the original out of the program and reports the error, and the CLI writes nothing to `.vela/src` and removes what an earlier run wrote there. The plugin also checks the config of every file it would lower on every build, so a config that broke after the last incremental `rbxtsc` build fails with `config-resolution-failed` even when no file changed, and `vela-rbxts/transformer` loads the compiler itself, so a native compiler that cannot load fails each styled file with `compiler-unavailable` where `rbxtsc` used to downgrade the plugin to a warning and compile `className` raw. A lowered file that no longer parses fails with `transformed-source-invalid`, and a host without `context.addDiagnostic` gets an exception for an error rather than nothing.
