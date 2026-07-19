# Agent guide

## Purpose

`vue-context-grab` is a development-only Vue/Vite tool. It lets a developer select rendered UI and copy concise, source-aware context for an AI coding assistant. It never sends data over the network.

## Boundaries

- Keep runtime code absent from production builds.
- Never read Vue component state, Inertia props, cookies, storage, request headers, or form-control values.
- Keep the Vite integration thin and reuse `vite-plugin-vue-inspector` for Vue source mapping.
- Prefer browser platform APIs and small pure functions over framework UI dependencies.
- Preserve keyboard access, visible focus, live-region feedback, high-contrast support, and reduced-motion behavior.
- Do not add a daemon, MCP server, screenshot capture, or autonomous editing without a new specification.

## Tooling

- Use Bun for dependency management and scripts.
- Use Oxc: `oxlint` for linting and `oxfmt` for formatting.
- Use Vitest with explicit behavioral assertions. Tests must derive expected results from `SPEC.md`.
- Build with tsdown and validate the package with publint.

## Verification

Run `bun run check` before committing. For privacy/redaction changes, also perform a discrimination check by temporarily removing one guard and confirming the relevant test fails, then restore it.
