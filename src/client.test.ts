import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...arguments_: unknown[]) => void;

const inspector = vi.hoisted(() => {
  const handlers = new Map<string, Set<Handler>>();
  return {
    handlers,
    isEnabled: { value: false },
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
  isEnabled: inspector.isEnabled,
}));

import { installVueContextGrab } from "./client";

describe("installVueContextGrab", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    inspector.handlers.clear();
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
    expect(payload).toContain("`resources/js/components/SaveButton.vue:12:3`");
    expect(payload).toContain("`resources/js/pages/school/Dashboard.vue:8:1`");
    expect(payload).toContain("Route: `/school/dashboard`");
    expect(payload).not.toContain("student=private");
    controller.dispose();
  });

  it("ships explicit focus, high-contrast, and reduced-motion treatments", () => {
    const controller = installVueContextGrab();
    const host = document.querySelector("[data-vue-context-grab]");
    const styles = host?.shadowRoot?.querySelector("style")?.textContent ?? "";
    const shortcut = host?.shadowRoot?.querySelector("kbd")?.textContent;

    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("@media (forced-colors: active)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).not.toContain("transition: all");
    expect(shortcut).toBe("Ctrl C");

    controller.dispose();
  });
});
