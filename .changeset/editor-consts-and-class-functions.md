---
"@vela-rbxts/compiler": minor
"@vela-rbxts/lsp": minor
"vela-rbxts-lsp": minor
---

Editor features now reach class lists outside the `className` attribute. A `const` string that a `className` names is completed, hovered, checked and sorted where it is declared, against what every element naming it shares, matching the const the compiler lowers. A new `classFunctions` editor option (`velaRbxts.classFunctions` in VS Code, `initializationOptions.classFunctions` or `workspace/didChangeConfiguration` elsewhere) lists helpers whose arguments are read wherever they are called, including tagged templates and cva-style variant maps, where `defaultVariants` and the variant names in `compoundVariants` are skipped. `get_class_tokens` takes the editor options as a second argument.
