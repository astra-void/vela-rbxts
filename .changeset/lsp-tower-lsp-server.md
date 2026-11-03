---
"@vela-rbxts/lsp": patch
---

The language server runs on `tower-lsp-server`, the maintained fork of the unmaintained `tower-lsp`, which stops reading on the `exit` notification itself, so the server still exits on `exit` while the client holds stdin open without scanning the input stream for it.
