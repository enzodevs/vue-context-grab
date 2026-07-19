import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/vite.ts"],
  format: "esm",
  dts: true,
  clean: true,
  sourcemap: true,
  deps: {
    neverBundle: ["vite", "vue", "vite-plugin-vue-inspector"],
  },
});
