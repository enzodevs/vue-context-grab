//#region src/types.d.ts
type ButtonPosition = "bottom-left" | "bottom-center" | "bottom-right" | "top-left" | "top-right";
interface ShortcutOptions {
  key: string;
  alt?: boolean;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
}
interface FormatterOptions {
  maxAncestors?: number;
  maxHtmlLength?: number;
  maxTextLength?: number;
}
interface ClientOptions extends FormatterOptions {
  buttonPosition?: ButtonPosition;
  shortcut?: ShortcutOptions | false;
}
interface VueContextGrabOptions extends ClientOptions {
  appendTo?: string | RegExp;
}
interface SourceLocation {
  file: string;
  line: number;
  column: number;
  component?: string;
}
interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface SelectionSnapshot {
  route: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  colorScheme: "dark" | "light";
  source: SourceLocation;
  ancestors: SourceLocation[];
  bounds: ElementBounds;
  styles: Record<string, string>;
  element: Element;
}
interface VueContextGrabController {
  activate: () => void;
  deactivate: () => void;
  dispose: () => void;
  readonly active: boolean;
}
//#endregion
export { SelectionSnapshot as a, VueContextGrabController as c, FormatterOptions as i, VueContextGrabOptions as l, ClientOptions as n, ShortcutOptions as o, ElementBounds as r, SourceLocation as s, ButtonPosition as t };
//# sourceMappingURL=types-0lF8qRcX.d.mts.map