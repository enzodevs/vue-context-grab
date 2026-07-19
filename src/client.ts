import type { ElementTraceInfo } from "vite-plugin-vue-inspector/client/record";
import {
  events,
  findTraceAtPointer,
  findTraceFromElement,
  isEnabled,
} from "vite-plugin-vue-inspector/client/listeners";
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
  const ui = createUi(resolved.buttonPosition, resolved.shortcut);
  let currentInfo: ElementTraceInfo | undefined;
  let isKeyboardSelection = false;
  let verticalHistory: ElementTraceInfo[] = [];
  let copiedFeedbackTimer: number | undefined;
  const unsubscribe = [
    events.on("hover", (info) => {
      currentInfo = info;
      isKeyboardSelection = false;
      verticalHistory = [];
      renderHighlight(ui, info);
    }),
    events.on("click", (info) => void captureSelection(info)),
    events.on("enabled", () => renderActiveState(ui, true)),
    events.on("disabled", () => renderActiveState(ui, false)),
  ];

  const clearCopiedFeedback = (): void => {
    if (copiedFeedbackTimer !== undefined) {
      window.clearTimeout(copiedFeedbackTimer);
      copiedFeedbackTimer = undefined;
    }
    ui.host.removeAttribute("data-copied");
    if (!isEnabled.value) ui.button.querySelector(".button-label")!.textContent = "Pick UI";
  };

  const setActive = (active: boolean, message?: string): void => {
    clearCopiedFeedback();
    if (!active) {
      currentInfo = undefined;
      isKeyboardSelection = false;
      verticalHistory = [];
    }
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

    if (isEnabled.value && !shouldPreserveNavigation(event)) {
      if (event.key === "Enter" && isKeyboardSelection && currentInfo) {
        event.preventDefault();
        event.stopPropagation();
        void captureSelection(currentInfo);
        return;
      }

      if (isArrowKey(event.key)) {
        const initialInfo =
          currentInfo ??
          findTraceAtPointer({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        if (!initialInfo) return;

        const nextInfo = findNavigationTarget(event.key, initialInfo, verticalHistory);
        if (!nextInfo) return;

        if (event.key === "ArrowUp") {
          verticalHistory.push(initialInfo);
          verticalHistory = verticalHistory.slice(-50);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          verticalHistory = [];
        }

        event.preventDefault();
        event.stopPropagation();
        currentInfo = nextInfo;
        isKeyboardSelection = true;
        renderHighlight(ui, nextInfo);
        ui.status.textContent = `Selected ${nextInfo.fullpath}. Use arrows to navigate or Enter to copy.`;
        return;
      }
    }

    if (!event.repeat && resolved.shortcut !== false && matchesShortcut(event, resolved.shortcut)) {
      if (!isEnabled.value && shouldPreserveNativeCopy()) return;
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
      const message = `Copied ${info.fullpath} to the clipboard.`;
      setActive(false, message);
      renderCopiedState(ui, message);
      copiedFeedbackTimer = window.setTimeout(clearCopiedFeedback, 1_600);
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
      clearCopiedFeedback();
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

function shouldPreserveNativeCopy(): boolean {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)
  ) {
    return true;
  }

  return Boolean(window.getSelection()?.toString());
}

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function isArrowKey(key: string): key is "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" {
  return ARROW_KEYS.has(key);
}

function shouldPreserveNavigation(event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true;

  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement instanceof HTMLElement && activeElement.isContentEditable)
  );
}

function findNavigationTarget(
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  currentInfo: ElementTraceInfo,
  verticalHistory: ElementTraceInfo[],
): ElementTraceInfo | undefined {
  if (key === "ArrowDown") {
    while (verticalHistory.length > 0) {
      const previousInfo = verticalHistory.pop();
      if (previousInfo && isNavigableTrace(previousInfo)) return previousInfo;
    }

    return findNestedTrace(currentInfo);
  }

  if (key === "ArrowUp") {
    const visited = new Set<Element>();
    if (currentInfo.el) visited.add(currentInfo.el);
    let parentInfo = currentInfo.getParent();
    let remainingDepth = 50;

    while (parentInfo && remainingDepth > 0) {
      remainingDepth -= 1;
      if (parentInfo.el && !visited.has(parentInfo.el) && isNavigableTrace(parentInfo)) {
        return parentInfo;
      }
      if (parentInfo.el) visited.add(parentInfo.el);
      parentInfo = parentInfo.getParent();
    }

    let parentElement = currentInfo.el?.parentElement;
    while (parentElement) {
      const domParentInfo = findTraceFromElement(parentElement);
      if (domParentInfo && isNavigableTrace(domParentInfo)) return domParentInfo;
      parentElement = parentElement.parentElement;
    }

    return undefined;
  }

  let sibling =
    key === "ArrowRight"
      ? currentInfo.el?.nextElementSibling
      : currentInfo.el?.previousElementSibling;
  while (sibling) {
    const siblingInfo = findTraceFromElement(sibling);
    if (siblingInfo && isNavigableTrace(siblingInfo)) return siblingInfo;
    sibling = key === "ArrowRight" ? sibling.nextElementSibling : sibling.previousElementSibling;
  }

  return undefined;
}

function findNestedTrace(currentInfo: ElementTraceInfo): ElementTraceInfo | undefined {
  const element = currentInfo.el;
  const rect = currentInfo.rect;
  if (!element || !rect || typeof document.elementsFromPoint !== "function") return undefined;

  const candidates = document.elementsFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
  const currentIndex = candidates.indexOf(element);
  if (currentIndex <= 0) return undefined;

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!candidate || !element.contains(candidate)) continue;
    const candidateInfo = findTraceFromElement(candidate);
    if (candidateInfo && isNavigableTrace(candidateInfo)) return candidateInfo;
  }

  return undefined;
}

function isNavigableTrace(info: ElementTraceInfo): boolean {
  const element = info.el;
  const rect = info.rect;
  return Boolean(
    element?.isConnected &&
    !element.closest("[data-v-inspector-ignore]") &&
    rect &&
    rect.width > 0 &&
    rect.height > 0,
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
  source: HTMLElement;
  tag: HTMLElement;
  status: HTMLElement;
}

function createUi(position: string, shortcut: ShortcutOptions | false): UiElements {
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
      <span class="target" aria-hidden="true">&lt;/&gt;</span>
      <span class="button-label">Pick UI</span>
      <kbd></kbd>
    </button>
    <div class="highlight" aria-hidden="true">
      <span class="label"><span class="tag"></span><span class="source"></span></span>
    </div>
    <span class="sr-status" aria-live="polite"></span>
  `;
  shadow.append(style, root);
  const shortcutHint = root.querySelector<HTMLElement>("kbd")!;
  shortcutHint.textContent = shortcut === false ? "" : formatShortcut(shortcut);
  shortcutHint.hidden = shortcut === false;

  return {
    host,
    button: root.querySelector("button")!,
    highlight: root.querySelector<HTMLElement>(".highlight")!,
    label: root.querySelector<HTMLElement>(".label")!,
    source: root.querySelector<HTMLElement>(".source")!,
    tag: root.querySelector<HTMLElement>(".tag")!,
    status: root.querySelector<HTMLElement>(".sr-status")!,
  };
}

function formatShortcut(shortcut: ShortcutOptions): string {
  return [
    shortcut.control ? "Ctrl" : undefined,
    shortcut.meta ? "⌘" : undefined,
    shortcut.alt ? "Alt" : undefined,
    shortcut.shift ? "⇧" : undefined,
    shortcut.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join(" ");
}

function renderActiveState(ui: UiElements, active: boolean, message?: string): void {
  ui.host.toggleAttribute("data-active", active);
  ui.button.setAttribute("aria-pressed", String(active));
  ui.button.querySelector(".button-label")!.textContent = active ? "Click an element" : "Pick UI";
  ui.status.textContent =
    message ??
    (active
      ? "Selection active. Hover an element, use arrows to navigate, then click or press Enter to copy."
      : "Selection inactive.");
  if (!active) ui.highlight.style.display = "none";
}

function renderCopiedState(ui: UiElements, message: string): void {
  ui.host.setAttribute("data-copied", "");
  ui.button.querySelector(".button-label")!.textContent = "Copied";
  ui.status.textContent = message;
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
  ui.tag.textContent = `<${info.el?.localName ?? "vue"}>`;
  ui.source.textContent = info.fullpath;
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
  .root { --accent: #67e8f9; --ink: #f8fafc; --surface: #09090b; --success: #86efac; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  button { position: fixed; display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 7px 10px; border: 1px solid #3f3f46; border-radius: 10px; background: color-mix(in srgb, var(--surface) 94%, transparent); color: var(--ink); box-shadow: 0 12px 32px rgb(0 0 0 / 35%); font: 600 12px/1.2 inherit; letter-spacing: .01em; cursor: pointer; pointer-events: auto; backdrop-filter: blur(10px); transition: transform 150ms cubic-bezier(.22, 1, .36, 1), border-color 150ms ease-out, background-color 150ms ease-out; }
  button:hover { border-color: #71717a; transform: translateY(-1px); }
  button:active { transform: scale(.97); }
  button:focus { outline: none; }
  button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  :host([data-active]) button { border-color: var(--accent); background: #164e63; }
  :host([data-copied]) button { border-color: var(--success); background: #14532d; }
  .bottom-left button { left: 16px; bottom: 16px; }
  .bottom-right button { right: 16px; bottom: 16px; }
  .top-left button { left: 16px; top: 16px; }
  .top-right button { right: 16px; top: 16px; }
  .target { position: relative; display: inline-flex; width: 22px; height: 18px; flex: 0 0 auto; align-items: center; justify-content: center; border: 1px solid #52525b; border-radius: 5px; color: var(--accent); font: 700 10px/1 ui-monospace, monospace; box-shadow: 2px 2px 0 #27272a; transition: transform 180ms cubic-bezier(.175, .885, .32, 1.275), width 180ms ease-out, border-radius 180ms ease-out, background-color 180ms ease-out, box-shadow 180ms ease-out; }
  .target::after { content: ""; position: absolute; left: 6px; top: 2px; width: 5px; height: 9px; border: solid #052e16; border-width: 0 2px 2px 0; border-radius: 1px; opacity: 0; transform: scale(0) rotate(42deg); }
  :host([data-copied]) .target { width: 18px; color: transparent; background: var(--success); border-color: var(--success); border-radius: 58% 42% 55% 45% / 46% 58% 42% 54%; box-shadow: 2px 2px 0 #052e16; animation: copied-pop 320ms cubic-bezier(.175, .885, .32, 1.275) both; }
  :host([data-copied]) .target::after { opacity: 1; animation: copied-check 300ms cubic-bezier(.175, .885, .32, 1.275) both; }
  kbd { padding: 2px 5px; border: 1px solid #52525b; border-bottom-width: 2px; border-radius: 5px; color: #d4d4d8; font: 500 10px/1.2 ui-monospace, monospace; }
  .highlight { display: none; position: fixed; left: 0; top: 0; border: 2px solid var(--accent); outline: 1px solid #083344; outline-offset: 1px; background: rgb(103 232 249 / 10%); box-shadow: 0 0 0 9999px rgb(3 7 18 / 5%); pointer-events: none; transition: transform 80ms ease-out, width 80ms ease-out, height 80ms ease-out; }
  .label { position: absolute; left: -2px; bottom: calc(100% + 6px); display: inline-flex; align-items: center; gap: 7px; max-width: min(560px, calc(100vw - 24px)); overflow: hidden; padding: 5px 8px; border: 1px solid var(--accent); border-radius: 6px; background: var(--surface); color: var(--ink); font: 600 11px/1.2 ui-monospace, monospace; white-space: nowrap; }
  .tag { flex: 0 0 auto; color: var(--accent); }
  .source { min-width: 0; overflow: hidden; color: #d4d4d8; text-overflow: ellipsis; }
  .sr-status { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @keyframes copied-pop { 0% { transform: scale(.72) rotate(-5deg); } 70% { transform: scale(1.12) rotate(2deg); } 100% { transform: scale(1) rotate(0); } }
  @keyframes copied-check { 0% { opacity: 0; transform: scale(0) rotate(42deg); } 70% { opacity: 1; transform: scale(1.2) rotate(42deg); } 100% { opacity: 1; transform: scale(1) rotate(42deg); } }
  @media (max-width: 520px) { button { max-width: calc(100vw - 24px); } kbd { display: none; } .label { gap: 5px; max-width: calc(100vw - 24px); } .source { max-width: 58vw; } .bottom-left button, .top-left button { left: 12px; } .bottom-right button, .top-right button { right: 12px; } }
  @media (forced-colors: active) { button, .highlight, .label { border: 2px solid ButtonText; forced-color-adjust: auto; } }
  @media (prefers-reduced-motion: reduce) { button, .target, .highlight { animation: none !important; transition: none !important; } }
`;
