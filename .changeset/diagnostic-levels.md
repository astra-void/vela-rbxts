---
"@vela-rbxts/lsp": minor
"vela-rbxts-lsp": minor
---

Diagnostics can be tuned per code. The LSP reads `lint`, a map from a diagnostic code to `error`, `warning`, `info`, `hint` or `ignore` that replaces the default severity, and `validate`, which stops publishing diagnostics while completions, hover and colors keep working. Both arrive through `initializationOptions` or under `velaRbxts` in `workspace/didChangeConfiguration`, and open documents are re-published when they change. VS Code exposes them as `velaRbxts.lint` and `velaRbxts.validate`.
