export type ButtonPosition =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "top-left"
  | "top-right";

export interface ShortcutOptions {
  key: string;
  alt?: boolean;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface FormatterOptions {
  maxAncestors?: number;
  maxHtmlLength?: number;
  maxTextLength?: number;
}

export interface ClientOptions extends FormatterOptions {
  buttonPosition?: ButtonPosition;
  shortcut?: ShortcutOptions | false;
}

export interface VueContextGrabOptions extends ClientOptions {
  appendTo?: string | RegExp;
}

export interface ResolvedFormatterOptions {
  maxAncestors: number;
  maxHtmlLength: number;
  maxTextLength: number;
}

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  component?: string;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionSnapshot {
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

export interface VueContextGrabController {
  activate: () => void;
  deactivate: () => void;
  dispose: () => void;
  readonly active: boolean;
}
