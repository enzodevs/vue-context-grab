import type { Plugin, PluginOption } from "vite";
import Inspector from "vite-plugin-vue-inspector";
import { resolveClientOptions } from "./options";
import type { ClientOptions, VueContextGrabOptions } from "./types";

const INSPECTOR_NOOP_ENTRY = "\0vue-context-grab-no-inspector-overlay";

export function vueContextGrab(options: VueContextGrabOptions = {}): PluginOption {
  const appendTo = options.appendTo ?? /(?:^|\/)src\/main\.[cm]?[jt]s$/;
  const clientOptions = resolveClientOptions(options);

  return [
    Inspector({
      appendTo: INSPECTOR_NOOP_ENTRY,
      enabled: false,
      toggleComboKey: false,
      toggleButtonVisibility: "never",
      viteDevtools: false,
    }),
    createClientPlugin(appendTo, clientOptions),
  ];
}

function createClientPlugin(appendTo: string | RegExp, options: Required<ClientOptions>): Plugin {
  return {
    name: "vue-context-grab:client",
    enforce: "post",
    apply: "serve",
    transform(code, id) {
      if (!matchesEntry(id, appendTo)) return undefined;
      if (code.includes("__installVueContextGrab")) return undefined;

      return {
        code: `${code}\nimport { installVueContextGrab as __installVueContextGrab } from "vue-context-grab/client";\n__installVueContextGrab(${JSON.stringify(options, null, 2)});\n`,
        map: null,
      };
    },
  };
}

function matchesEntry(id: string, appendTo: string | RegExp): boolean {
  const cleanId = id.split("?", 1)[0] ?? id;
  if (typeof appendTo === "string") return cleanId.endsWith(appendTo);
  appendTo.lastIndex = 0;
  return appendTo.test(cleanId);
}
