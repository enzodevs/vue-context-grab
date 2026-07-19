import { a as SelectionSnapshot, c as VueContextGrabController, i as FormatterOptions, l as VueContextGrabOptions, n as ClientOptions, o as ShortcutOptions, r as ElementBounds, s as SourceLocation, t as ButtonPosition } from "./types-0lF8qRcX.mjs";
import { installVueContextGrab } from "./client.mjs";
//#region src/formatter.d.ts
declare function redactSensitiveText(value: string): string;
declare function sanitizeElementHtml(element: Element, options?: FormatterOptions): string;
declare function formatSelectionContext(snapshot: SelectionSnapshot, options?: FormatterOptions): string;
//#endregion
export { type ButtonPosition, type ClientOptions, type ElementBounds, type FormatterOptions, type SelectionSnapshot, type ShortcutOptions, type SourceLocation, type VueContextGrabController, type VueContextGrabOptions, formatSelectionContext, installVueContextGrab, redactSensitiveText, sanitizeElementHtml };
//# sourceMappingURL=index.d.mts.map