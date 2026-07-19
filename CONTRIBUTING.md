# Contributing

Vue Context Grab is intentionally small. Changes should preserve its development-only runtime, local clipboard boundary, and source accuracy.

## Before opening a pull request

1. Open an issue for changes that alter the public API, clipboard format, privacy rules, or dependency set.
2. Add or update behavioral tests derived from [SPEC.md](SPEC.md).
3. Run the full check:

```sh
bun install
bun run check
```

## Project rules

- Do not add production instrumentation or network transmission.
- Do not read Vue state, application storage, cookies, request data, or form values.
- Reuse `vite-plugin-vue-inspector` for Vue source mapping.
- Preserve keyboard access, visible focus, high-contrast support, and reduced-motion behavior.
- Keep pull requests focused. Explain the user-visible change and the verification you ran.

## Reporting bugs

Include the Vue and Vite versions, browser, minimal reproduction, expected behavior, and actual behavior. Remove private application data from screenshots or copied payloads.
