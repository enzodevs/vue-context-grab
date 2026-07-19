import type { ElementTraceInfo } from "vite-plugin-vue-inspector/client/record";
import { events, isEnabled } from "vite-plugin-vue-inspector/client/listeners";
import { formatSelectionContext } from "./formatter";
import { resolveClientOptions } from "./options";
import type {
  ClientOptions,
  ElementBounds,
  SelectionSnapshot,
  ShortcutOptions,
  SourceLocation,
  VueContextGrabController,
} from "./types";

const CONTROLLER_KEY = Symbol.for("vue-context-grab.controller");
const STYLE_PROPERTIES = [
  "align-items",
  "background-color",
  "border-color",
  "border-radius",
  "border-style",
  "border-width",
  "box-shadow",
  "color",
  "display",
  "flex-direction",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "grid-template-columns",
  "justify-content",
  "line-height",
  "margin",
  "max-width",
  "min-height",
  "opacity",
  "overflow",
  "padding",
  "position",
] as const;

type ControllerGlobal = typeof globalThis & {
  [CONTROLLER_KEY]?: VueContextGrabController;
};

export function installVueContextGrab(options: ClientOptions = {}): VueContextGrabController {
  const controllerGlobal = globalThis as ControllerGlobal;
  const installed = controllerGlobal[CONTROLLER_KEY];
  if (installed) return installed;

  if (typeof document === "undefined") return createServerController();

  const resolved = resolveClientOptions(options);
  const ui = createUi(resolved.buttonPosition);
  const unsubscribe = [
    events.on("hover", (info) => renderHighlight(ui, info)),
    events.on("click", (info) => void captureSelection(info)),
    events.on("enabled", () => renderActiveState(ui, true)),
    events.on("disabled", () => renderActiveState(ui, false)),
  ];

  const setActive = (active: boolean, message?: string): void => {
    isEnabled.value = active;
    renderActiveState(ui, active, message);
  };

  const onButtonClick = (): void => setActive(!isEnabled.value);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && isEnabled.value) {
      event.preventDefault();
      setActive(false, "Selection cancelled.");
      return;
    }

    if (!event.repeat && resolved.shortcut !== false && matchesShortcut(event, resolved.shortcut)) {
      event.preventDefault();
      setActive(!isEnabled.value);
    }
  };

  async function captureSelection(info: ElementTraceInfo): Promise<void> {
    if (!info.el) return;

    try {
      const snapshot = createSnapshot(info);
      const markdown = formatSelectionContext(snapshot, resolved);
      await copyText(markdown);
      setActive(false, `Copied ${info.fullpath} to the clipboard.`);
    } catch {
      setActive(false, "Could not copy UI context. Check clipboard permissions and try again.");
    }
  }

  ui.button.addEventListener("click", onButtonClick);
  document.addEventListener("keydown", onKeyDown);
  document.body.append(ui.host);

  let disposed = false;
  const controller: VueContextGrabController = {
    activate: () => setActive(true),
    deactivate: () => setActive(false),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      setActive(false);
      ui.button.removeEventListener("click", onButtonClick);
      document.removeEventListener("keydown", onKeyDown);
      for (const stopListening of unsubscribe) stopListening();
      ui.host.remove();
      delete controllerGlobal[CONTROLLER_KEY];
    },
    get active() {
      return isEnabled.value;
    },
  };

  controllerGlobal[CONTROLLER_KEY] = controller;
  return controller;
}

function createSnapshot(info: ElementTraceInfo): SelectionSnapshot {
  const rect = info.rect ?? info.el!.getBoundingClientRect();
  const styles = getComputedStyle(info.el!);

  return {
    route: window.location.pathname,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    colorScheme:
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    source: sourceFromTrace(info),
    ancestors: collectAncestors(info),
    bounds: rectToBounds(rect),
    styles: Object.fromEntries(
      STYLE_PROPERTIES.map((property) => [property, styles.getPropertyValue(property)]),
    ),
    element: info.el!,
  };
}

function collectAncestors(info: ElementTraceInfo): SourceLocation[] {
  const ancestors: SourceLocation[] = [];
  const visited = new Set<unknown>();
  if (info.vnode) visited.add(info.vnode);
  if (info.el) visited.add(info.el);
  let current = info.getParent();

  while (current && ancestors.length < 12) {
    if (
      (current.vnode !== undefined && visited.has(current.vnode)) ||
      (current.el !== undefined && visited.has(current.el))
    ) {
      break;
    }
    if (current.vnode) visited.add(current.vnode);
    if (current.el) visited.add(current.el);
    ancestors.push(sourceFromTrace(current));
    current = current.getParent();
  }

  return ancestors;
}

function sourceFromTrace(info: ElementTraceInfo): SourceLocation {
  const component = componentName(info.vnode?.type);
  return {
    file: info.filepath,
    line: info.pos[1],
    column: info.pos[2],
    ...(component ? { component } : {}),
  };
}

function componentName(type: unknown): string | undefined {
  if (typeof type === "string") return type;
  if (!type || typeof type !== "object") return undefined;
  const declaredName = Reflect.get(type, "name");
  if (typeof declaredName === "string") return declaredName;
  const inferredName = Reflect.get(type, "__name");
  if (typeof inferredName === "string") return inferredName;
  return undefined;
}

function rectToBounds(rect: DOMRect): ElementBounds {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutOptions): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    event.altKey === Boolean(shortcut.alt) &&
    event.ctrlKey === Boolean(shortcut.control) &&
    event.metaKey === Boolean(shortcut.meta) &&
    event.shiftKey === Boolean(shortcut.shift)
  );
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

interface UiElements {
  host: HTMLElement;
  button: HTMLButtonElement;
  highlight: HTMLElement;
  label: HTMLElement;
  status: HTMLElement;
}

function createUi(position: string): UiElements {
  const host = document.createElement("div");
  host.dataset.vueContextGrab = "";
  host.setAttribute("data-v-inspector-ignore", "");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = UI_CSS;
  const root = document.createElement("div");
  root.className = `root ${position}`;
  root.innerHTML = `
    <button type="button" aria-pressed="false" aria-label="Select Vue UI to copy context">
      <span class="target" aria-hidden="true"></span>
      <span class="button-label">Pick UI</span>
      <kbd>Alt ⇧ C</kbd>
    </button>
    <div class="highlight" aria-hidden="true"><span class="label"></span></div>
    <span class="sr-status" aria-live="polite"></span>
  `;
  shadow.append(style, root);

  return {
    host,
    button: root.querySelector("button")!,
    highlight: root.querySelector<HTMLElement>(".highlight")!,
    label: root.querySelector<HTMLElement>(".label")!,
    status: root.querySelector<HTMLElement>(".sr-status")!,
  };
}

function renderActiveState(ui: UiElements, active: boolean, message?: string): void {
  ui.host.toggleAttribute("data-active", active);
  ui.button.setAttribute("aria-pressed", String(active));
  ui.button.querySelector(".button-label")!.textContent = active ? "Click an element" : "Pick UI";
  ui.status.textContent =
    message ??
    (active ? "Selection active. Click an element or press Escape." : "Selection inactive.");
  if (!active) ui.highlight.style.display = "none";
}

function renderHighlight(ui: UiElements, info: ElementTraceInfo | undefined): void {
  const rect = info?.rect;
  if (!rect || !isEnabled.value) {
    ui.highlight.style.display = "none";
    return;
  }

  ui.highlight.style.display = "block";
  ui.highlight.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
  ui.highlight.style.width = `${rect.width}px`;
  ui.highlight.style.height = `${rect.height}px`;
  ui.label.textContent = info.fullpath;
}

function createServerController(): VueContextGrabController {
  return {
    activate() {},
    deactivate() {},
    dispose() {},
    active: false,
  };
}

const UI_CSS = `
  :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; color-scheme: dark; }
  *, *::before, *::after { box-sizing: border-box; }
  .root { --accent: #67e8f9; --ink: #f8fafc; --surface: #09090b; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  button { position: fixed; display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 7px 10px; border: 1px solid #3f3f46; border-radius: 10px; background: color-mix(in srgb, var(--surface) 94%, transparent); color: var(--ink); box-shadow: 0 12px 32px rgb(0 0 0 / 35%); font: 600 12px/1.2 inherit; letter-spacing: .01em; cursor: pointer; pointer-events: auto; backdrop-filter: blur(10px); transition: transform 150ms cubic-bezier(.22, 1, .36, 1), border-color 150ms ease-out, background-color 150ms ease-out; }
  button:hover { border-color: #71717a; transform: translateY(-1px); }
  button:active { transform: scale(.97); }
  button:focus { outline: none; }
  button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  :host([data-active]) button { border-color: var(--accent); background: #164e63; }
  .bottom-left button { left: 16px; bottom: 16px; }
  .bottom-right button { right: 16px; bottom: 16px; }
  .top-left button { left: 16px; top: 16px; }
  .top-right button { right: 16px; top: 16px; }
  .target { width: 13px; height: 13px; border: 2px solid currentColor; border-radius: 3px; box-shadow: inset 0 0 0 2px var(--surface); }
  kbd { padding: 2px 5px; border: 1px solid #52525b; border-bottom-width: 2px; border-radius: 5px; color: #d4d4d8; font: 500 10px/1.2 ui-monospace, monospace; }
  .highlight { display: none; position: fixed; left: 0; top: 0; border: 2px solid var(--accent); outline: 1px solid #083344; outline-offset: 1px; background: rgb(103 232 249 / 10%); box-shadow: 0 0 0 9999px rgb(3 7 18 / 5%); pointer-events: none; transition: transform 80ms ease-out, width 80ms ease-out, height 80ms ease-out; }
  .label { position: absolute; left: -2px; bottom: calc(100% + 6px); max-width: min(560px, 90vw); overflow: hidden; padding: 5px 8px; border: 1px solid var(--accent); border-radius: 6px; background: var(--surface); color: var(--ink); font: 600 11px/1.2 ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; }
  .sr-status { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (forced-colors: active) { button, .highlight, .label { border: 2px solid ButtonText; forced-color-adjust: auto; } }
  @media (prefers-reduced-motion: reduce) { button, .highlight { transition: none !important; } }
`;
