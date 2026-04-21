# rbxts-tailwind

Tailwind CSS integration and compiler for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the core compiler (Rust/N-API), Roblox TypeScript host adapters, and shared configuration tools managed with pnpm workspaces and Turborepo.

## Apps

- `apps/compiler-harness`: Compiler-native debug harness that directly exercises `@rbxts-tailwind/compiler`.
- `apps/rbxts-harness`: Minimal real `rbxts` consumer app harness for validating app-boundary TSX and `className` usage.

## Packages

- `@rbxts-tailwind/ir`: Intermediate representation layer contracts and primitives.
- `@rbxts-tailwind/core`: Semantic contracts and ownership boundary.
- `@rbxts-tailwind/config`: Configuration contracts and loading entry points.
- `@rbxts-tailwind/types`: Workspace-wide shared public types.
- `@rbxts-tailwind/compiler`: Core Rust/N-API compiler execution and semantic resolution.
- `@rbxts-tailwind/rbxtsc-host`: Host adapter boundary for `rbxtsc` integration.
- `rbxts-tailwind`: The main consumer package and transformer entry point.

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages and apps
pnpm build

# Run development mode
pnpm dev

# Lint code
pnpm lint

# Check types
pnpm typecheck

# Clean workspace
pnpm clean
```
