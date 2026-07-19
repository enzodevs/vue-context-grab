import type {
  ButtonPosition,
  ClientOptions,
  FormatterOptions,
  ResolvedFormatterOptions,
  ShortcutOptions,
} from "./types";

export const DEFAULT_SHORTCUT: Readonly<ShortcutOptions> = {
  key: "c",
  alt: true,
  shift: true,
};

export const DEFAULT_BUTTON_POSITION: ButtonPosition = "bottom-left";

export const DEFAULT_FORMATTER_OPTIONS: Readonly<ResolvedFormatterOptions> = {
  maxAncestors: 5,
  maxHtmlLength: 4_000,
  maxTextLength: 240,
};

export function resolveFormatterOptions(options: FormatterOptions = {}): ResolvedFormatterOptions {
  return {
    maxAncestors: positiveInteger(options.maxAncestors, DEFAULT_FORMATTER_OPTIONS.maxAncestors),
    maxHtmlLength: positiveInteger(options.maxHtmlLength, DEFAULT_FORMATTER_OPTIONS.maxHtmlLength),
    maxTextLength: positiveInteger(options.maxTextLength, DEFAULT_FORMATTER_OPTIONS.maxTextLength),
  };
}

export function resolveClientOptions(options: ClientOptions = {}): Required<ClientOptions> {
  return {
    buttonPosition: options.buttonPosition ?? DEFAULT_BUTTON_POSITION,
    shortcut: options.shortcut === false ? false : { ...DEFAULT_SHORTCUT, ...options.shortcut },
    ...resolveFormatterOptions(options),
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
