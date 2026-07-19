import { t as resolveClientOptions } from "./options-BK3IP3is.mjs";
import Inspector from "vite-plugin-vue-inspector";
//#region src/vite.ts
const INSPECTOR_NOOP_ENTRY = "\0vue-context-grab-no-inspector-overlay";
function vueContextGrab(options = {}) {
	const appendTo = options.appendTo ?? /(?:^|\/)src\/main\.[cm]?[jt]s$/;
	const clientOptions = resolveClientOptions(options);
	return [Inspector({
		appendTo: INSPECTOR_NOOP_ENTRY,
		enabled: false,
		toggleComboKey: false,
		toggleButtonVisibility: "never",
		viteDevtools: false
	}), createClientPlugin(appendTo, clientOptions)];
}
function createClientPlugin(appendTo, options) {
	return {
		name: "vue-context-grab:client",
		enforce: "post",
		apply: "serve",
		transform(code, id) {
			if (!matchesEntry(id, appendTo)) return void 0;
			if (code.includes("__installVueContextGrab")) return void 0;
			return {
				code: `${code}\nimport { installVueContextGrab as __installVueContextGrab } from "vue-context-grab/client";\n__installVueContextGrab(${JSON.stringify(options, null, 2)});\n`,
				map: null
			};
		}
	};
}
function matchesEntry(id, appendTo) {
	const cleanId = id.split("?", 1)[0] ?? id;
	if (typeof appendTo === "string") return cleanId.endsWith(appendTo);
	appendTo.lastIndex = 0;
	return appendTo.test(cleanId);
}
//#endregion
export { vueContextGrab };

//# sourceMappingURL=vite.mjs.map