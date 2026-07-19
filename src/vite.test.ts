import type { Plugin, PluginOption } from "vite";
import { describe, expect, it } from "vitest";
import { vueContextGrab } from "./vite";

function flattenPlugins(input: PluginOption): Plugin[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.flatMap(flattenPlugins);
  if (input instanceof Promise) throw new TypeError("Unexpected async plugin");
  return [input];
}

describe("vueContextGrab", () => {
  it("adds its client only to the configured entry during Vite serve", async () => {
    const plugins = flattenPlugins(
      vueContextGrab({ appendTo: "resources/js/app.ts", buttonPosition: "bottom-right" }),
    );
    const plugin = plugins.find(({ name }) => name === "vue-context-grab:client");

    expect(plugin?.apply).toBe("serve");
    expect(plugin?.enforce).toBe("post");

    const transform = plugin?.transform;
    if (typeof transform !== "function") throw new TypeError("Missing transform hook");

    const transformed = await transform.call(
      {} as never,
      "export const boot = true;",
      "/project/resources/js/app.ts",
      {} as never,
    );
    const ignored = await transform.call(
      {} as never,
      "export const other = true;",
      "/project/resources/js/other.ts",
      {} as never,
    );

    expect(transformed).toMatchObject({
      code: expect.stringContaining('from "vue-context-grab/client"'),
    });
    expect(transformed).toMatchObject({
      code: expect.stringContaining('"buttonPosition": "bottom-right"'),
    });
    expect(ignored).toBeUndefined();
  });

  it("configures the source engine without its competing overlay", () => {
    const plugins = flattenPlugins(vueContextGrab({ appendTo: /src\/main\.ts$/ }));
    const inspector = plugins.find(({ name }) => name === "vite-plugin-vue-inspector");
    const grabber = plugins.find(({ name }) => name === "vue-context-grab:client");

    expect(inspector).toBeDefined();
    expect(grabber).toBeDefined();
  });
});
