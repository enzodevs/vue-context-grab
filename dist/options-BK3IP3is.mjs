//#region src/options.ts
const DEFAULT_SHORTCUT = {
	key: "c",
	control: true
};
const DEFAULT_FORMATTER_OPTIONS = {
	maxAncestors: 5,
	maxHtmlLength: 4e3,
	maxTextLength: 240
};
function resolveFormatterOptions(options = {}) {
	return {
		maxAncestors: positiveInteger(options.maxAncestors, DEFAULT_FORMATTER_OPTIONS.maxAncestors),
		maxHtmlLength: positiveInteger(options.maxHtmlLength, DEFAULT_FORMATTER_OPTIONS.maxHtmlLength),
		maxTextLength: positiveInteger(options.maxTextLength, DEFAULT_FORMATTER_OPTIONS.maxTextLength)
	};
}
function resolveClientOptions(options = {}) {
	return {
		buttonPosition: options.buttonPosition ?? "bottom-left",
		shortcut: options.shortcut === false ? false : {
			...DEFAULT_SHORTCUT,
			...options.shortcut
		},
		...resolveFormatterOptions(options)
	};
}
function positiveInteger(value, fallback) {
	return Number.isInteger(value) && (value ?? 0) > 0 ? value : fallback;
}
//#endregion
export { resolveFormatterOptions as n, resolveClientOptions as t };

//# sourceMappingURL=options-BK3IP3is.mjs.map