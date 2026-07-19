# vue-context-grab

Select a rendered Vue element in development and copy concise, source-aware context for an AI coding assistant. It is a Vue/Vite counterpart to React-oriented element grabbers, built on the maintained source mapping from `vite-plugin-vue-inspector`.

The tool is local and explicit: it writes only to the clipboard after a selection. It does not send network requests, inspect Vue state, read Inertia props, or capture form values, cookies, storage, URL queries, or URL fragments.

## Install

Until the package has a registry or Git remote, install a reviewed packed release:

```sh
bun add -d ./vue-context-grab-0.2.2.tgz
```

After publication, the intended registry command is `bun add -d vue-context-grab`.

```ts
// vite.config.ts
import { vueContextGrab } from "vue-context-grab/vite";

export default defineConfig({
  plugins: [
    vue(),
    vueContextGrab({
      appendTo: "resources/js/app.ts",
    }),
  ],
});
```

`appendTo` must match the browser entry module. The adapter runs only for `vite serve`; production builds receive no client import or source instrumentation.

## Use

- Choose **Pick UI** or press `Ctrl+C` when no form field or text selection is active. Native copy remains unchanged while editing or copying selected text.
- Hover a Vue element to confirm its XML-style element tag, Vue source, and bounds.
- Use `↑` to move to a parent, `↓` to return toward the prior child, and `←`/`→` to move between visible siblings.
- Press Enter to copy the keyboard-selected element.
- Click to copy context and exit selection mode.
- A brief **Copied** check confirms clipboard success; the control then returns to its compact idle state.
- Press Escape to cancel.

The Markdown payload includes the pathname, viewport, preferred color scheme, source trace and ancestry, sanitized HTML, bounds, and an allowlisted computed-style summary. Paste it into your coding assistant and add the requested visual change.

Rendered text is preserved only within configured length limits and is labeled as untrusted data. Common identifiers and secrets are redacted and nested Markdown fences are neutralized, but review clipboard content before pasting when a screen may contain sensitive domain data.

## Options

```ts
vueContextGrab({
  appendTo: /resources\/js\/app\.ts$/,
  projectRoot: process.cwd(),
  shortcut: { control: true, key: "c" },
  buttonPosition: "bottom-left",
  maxHtmlLength: 4_000,
  maxTextLength: 240,
  maxAncestors: 5,
});
```

See [SPEC.md](SPEC.md) for the complete behavior and privacy contract.

## Development

```sh
bun install
bun run check
```

The project uses strict TypeScript, Vitest, tsdown, publint, and the Oxc toolchain (`oxlint` and `oxfmt`).
