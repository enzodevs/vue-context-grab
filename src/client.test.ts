import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...arguments_: unknown[]) => void;

const inspector = vi.hoisted(() => {
  const handlers = new Map<string, Set<Handler>>();
  const traces = new Map<object, unknown>();
  return {
    handlers,
    traces,
    isEnabled: { value: false },
    findTraceAtPointer: vi.fn(),
    findTraceFromElement: vi.fn((element: object) => traces.get(element)),
    events: {
      on(name: string, handler: Handler) {
        const group = handlers.get(name) ?? new Set<Handler>();
        group.add(handler);
        handlers.set(name, group);
        return () => group.delete(handler);
      },
    },
    emit(name: string, ...arguments_: unknown[]) {
      for (const handler of handlers.get(name) ?? []) handler(...arguments_);
    },
  };
});

vi.mock("vite-plugin-vue-inspector/client/listeners", () => ({
  events: inspector.events,
  findTraceAtPointer: inspector.findTraceAtPointer,
  findTraceFromElement: inspector.findTraceFromElement,
  isEnabled: inspector.isEnabled,
}));

import { installVueContextGrab } from "./client";

describe("installVueContextGrab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    inspector.handlers.clear();
    inspector.traces.clear();
    inspector.findTraceAtPointer.mockReset();
    inspector.findTraceFromElement.mockClear();
    inspector.isEnabled.value = false;
  });

  afterEach(() => {
    installVueContextGrab().dispose();
  });

  it("offers keyboard-equivalent activation, live feedback, Escape, and clean disposal", () => {
    const controller = installVueContextGrab();
    const host = document.querySelector("[data-vue-context-grab]")!;
    const button = host.shadowRoot!.querySelector<HTMLButtonElement>("button")!;
    const status = host.shadowRoot!.querySelector<HTMLElement>('[aria-live="polite"]')!;

    expect(button.getAttribute("aria-pressed")).toBe("false");
    button.click();
    expect(inspector.isEnabled.value).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("Selection active");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(inspector.isEnabled.value).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }),
    );
    expect(inspector.isEnabled.value).toBe(true);

    controller.dispose();
    expect(document.querySelector("[data-vue-context-grab]")).toBeNull();
    expect(inspector.isEnabled.value).toBe(false);
  });

  it("preserves native Ctrl+C when editing or copying selected text", () => {
    const controller = installVueContextGrab();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();

    const editingCopy = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(editingCopy);

    expect(controller.active).toBe(false);
    expect(editingCopy.defaultPrevented).toBe(false);

    input.blur();
    const paragraph = document.createElement("p");
    paragraph.textContent = "Selected text";
    document.body.append(paragraph);
    const selection = window.getSelection()!;
    selection.selectAllChildren(paragraph);
    const selectedCopy = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(selectedCopy);

    expect(controller.active).toBe(false);
    expect(selectedCopy.defaultPrevented).toBe(false);
  });

  it("preserves arrow-key editing while a form field is focused", () => {
    const controller = installVueContextGrab();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    controller.activate();

    const arrowLeft = new KeyboardEvent("keydown", {
      key: "ArrowLeft",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(arrowLeft);

    expect(arrowLeft.defaultPrevented).toBe(false);
    expect(controller.active).toBe(true);

    controller.dispose();
  });

  it("is idempotent", () => {
    const first = installVueContextGrab();
    const second = installVueContextGrab();

    expect(second).toBe(first);
    expect(document.querySelectorAll("[data-vue-context-grab]")).toHaveLength(1);

    first.dispose();
  });

  it("copies a source-aware payload and exits selection mode", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    window.history.replaceState({}, "", "/school/dashboard?student=private#grades");
    document.body.innerHTML = '<section><button class="save">Save</button></section>';
    const element = document.querySelector("button")!;
    const parentTrace = {
      el: document.querySelector("section")!,
      vnode: undefined,
      pos: ["resources/js/pages/school/Dashboard.vue", 8, 1],
      filepath: "resources/js/pages/school/Dashboard.vue",
      fullpath: "resources/js/pages/school/Dashboard.vue:8:1",
      rect: DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 300 }),
      getParent: () => undefined,
    };
    const trace = {
      el: element,
      vnode: { type: { name: "SaveButton" } },
      pos: ["resources/js/components/SaveButton.vue", 12, 3],
      filepath: "resources/js/components/SaveButton.vue",
      fullpath: "resources/js/components/SaveButton.vue:12:3",
      rect: DOMRect.fromRect({ x: 10, y: 20, width: 100, height: 40 }),
      getParent: () => parentTrace,
    };
    const controller = installVueContextGrab();
    controller.activate();

    inspector.emit("click", trace, new MouseEvent("click"));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(controller.active).toBe(false);
    });
    const payload = writeText.mock.calls[0]?.[0] as string;
    const host = document.querySelector("[data-vue-context-grab]")!;
    expect(payload).toContain("`resources/js/components/SaveButton.vue:12:3`");
    expect(payload).toContain("`resources/js/pages/school/Dashboard.vue:8:1`");
    expect(payload).toContain("Route: `/school/dashboard`");
    expect(payload).not.toContain("student=private");
    expect(host.hasAttribute("data-copied")).toBe(true);
    expect(host.shadowRoot!.querySelector(".button-label")?.textContent).toBe("Copied");
    controller.dispose();
  });

  it("navigates Vue hierarchy and siblings with arrows, then copies with Enter", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    document.body.innerHTML =
      "<main><section><button>First</button><button>Second</button></section></main>";
    const section = document.querySelector("section")!;
    const buttons = document.querySelectorAll("button");
    const first = buttons[0]!;
    const second = buttons[1]!;
    const sectionTrace = {
      el: section,
      vnode: undefined,
      pos: ["resources/js/components/ActionGroup.vue", 8, 1],
      filepath: "resources/js/components/ActionGroup.vue",
      fullpath: "resources/js/components/ActionGroup.vue:8:1",
      rect: DOMRect.fromRect({ x: 10, y: 10, width: 220, height: 50 }),
      getParent: () => undefined,
    };
    const firstTrace = {
      el: first,
      vnode: undefined,
      pos: ["resources/js/components/ActionButton.vue", 12, 3],
      filepath: "resources/js/components/ActionButton.vue",
      fullpath: "resources/js/components/ActionButton.vue:12:3",
      rect: DOMRect.fromRect({ x: 10, y: 10, width: 100, height: 40 }),
      getParent: () => undefined,
    };
    const secondTrace = {
      el: second,
      vnode: undefined,
      pos: ["resources/js/components/ActionButton.vue", 18, 3],
      filepath: "resources/js/components/ActionButton.vue",
      fullpath: "resources/js/components/ActionButton.vue:18:3",
      rect: DOMRect.fromRect({ x: 120, y: 10, width: 100, height: 40 }),
      getParent: () => sectionTrace,
    };
    inspector.traces.set(section, sectionTrace);
    inspector.traces.set(first, firstTrace);
    inspector.traces.set(second, secondTrace);

    const controller = installVueContextGrab();
    const host = document.querySelector("[data-vue-context-grab]")!;
    const tag = host.shadowRoot!.querySelector<HTMLElement>(".tag")!;
    const source = host.shadowRoot!.querySelector<HTMLElement>(".source")!;
    controller.activate();
    inspector.emit("hover", firstTrace);
    expect(tag.textContent).toBe("<button>");
    expect(source.textContent).toBe(firstTrace.fullpath);

    const arrowUp = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(arrowUp);
    expect(arrowUp.defaultPrevented).toBe(true);
    expect(tag.textContent).toBe("<section>");
    expect(source.textContent).toBe(sectionTrace.fullpath);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    expect(source.textContent).toBe(firstTrace.fullpath);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }),
    );
    expect(source.textContent).toBe(secondTrace.fullpath);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledOnce();
      expect(controller.active).toBe(false);
    });
    expect(writeText.mock.calls[0]?.[0]).toContain(`\`${secondTrace.fullpath}\``);

    controller.dispose();
  });

  it("ships explicit focus, high-contrast, and reduced-motion treatments", () => {
    const controller = installVueContextGrab();
    const host = document.querySelector("[data-vue-context-grab]");
    const styles = host?.shadowRoot?.querySelector("style")?.textContent ?? "";
    const shortcut = host?.shadowRoot?.querySelector("kbd")?.textContent;
    const toolMark = host?.shadowRoot?.querySelector(".target")?.textContent;

    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@keyframes copied-pop");
    expect(styles).not.toContain("transition: all");
    expect(shortcut).toBe("Ctrl C");
    expect(toolMark).toBe("</>");

    controller.dispose();
  });
});
