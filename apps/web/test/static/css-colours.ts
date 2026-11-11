import { parseCss, type CssDeclaration } from "../support/css";
import { violation, type Violation } from "../support/scan";

/** Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 10.3: the colour Tokens and the scan over them. */
export type Sheet = { readonly path: string; readonly text: string };

/** The fifteen colour Tokens of the Token_Sheet. Values are lowercase, as Prettier writes them. */
export const TOKEN_VALUES: Readonly<Record<string, string>> = {
  "--paper": "#fffdf8",
  "--desk": "#e9e3d6",
  "--panel": "#fbf8f1",
  "--ink": "#1b1915",
  "--muted": "#5e574c",
  "--rule": "#cfc6b4",
  "--rule-light": "#ddd4c2",
  "--margin-rule": "#b5a98f",
  "--oxblood": "#6b1a24",
  "--fail": "#a8001c",
  "--fail-ring": "#ff8a8a",
  "--disabled-border": "#8c8475",
  "--disabled-fill": "#f1ece1",
  "--white": "#ffffff",
  "--overlay": "rgba(27, 25, 21, 0.55)",
};

/** The print Tokens: the colours the print view used before the redesign. */
export const PRINT_COLOUR_VALUES: Readonly<Record<string, string>> = {
  "--print-paper": "#ffffff",
  "--print-ink": "#111111",
  "--print-rule": "#b0b0b0",
};

/** Names the stylesheets may still read until task 5.1 removes them and this allowance together. */
export const LEGACY_ALIASES: readonly string[] = [
  "--ui-bg",
  "--accent",
  "--size-ui",
  "--size-editor",
  "--size-pane",
  "--size-wordmark",
  "--size-status",
  "--line-editor",
];

const ROOT_COLOURS: Readonly<Record<string, string>> = { ...TOKEN_VALUES, ...PRINT_COLOUR_VALUES };

const NAMED_COLOURS = new Set(
  (
    "black white red green blue yellow orange purple pink gray grey silver navy teal maroon olive lime " +
    "aqua fuchsia cyan magenta brown gold indigo violet coral crimson salmon tomato khaki beige ivory " +
    "lavender plum orchid turquoise tan azure snow linen"
  ).split(" "),
);
const COLOUR_PROPS =
  /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke|caret-color|accent-color)$/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTION_LITERAL = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\([^)]*\)/gi;

const squash = (v: string): string => v.trim().replace(/\s+/g, " ").toLowerCase();
const isPaneFile = (path: string): boolean => /^src\/pane\//.test(path);

/** Custom properties declared on `:root`, values squashed to one line. */
export function parseTokenSheet(globalsText: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const d of parseCss(globalsText).declarations) {
    if (d.selector.trim() === ":root" && d.prop.startsWith("--")) tokens[d.prop] = d.value.trim();
  }
  return tokens;
}

function isRootToken(d: CssDeclaration): boolean {
  return d.selector.trim() === ":root" && ROOT_COLOURS[d.prop] !== undefined;
}

function literalViolations(path: string, d: CssDeclaration): Violation[] {
  const literals = [...(d.value.match(HEX) ?? []), ...(d.value.match(FUNCTION_LITERAL) ?? [])];
  if (literals.length === 0 && COLOUR_FUNCTION.test(d.value))
    return [violation(path, d.line, "colour function is not allowed")];
  const expected = ROOT_COLOURS[d.prop];
  const onToken = d.selector.trim() === ":root" && expected !== undefined;
  return literals.flatMap((lit) => {
    if (!onToken)
      return [violation(path, d.line, `colour ${lit} is allowed only on its Token in :root`)];
    return squash(lit) === squash(expected)
      ? []
      : [violation(path, d.line, `${d.prop} must be ${expected}`)];
  });
}

function varViolations(path: string, d: CssDeclaration): Violation[] {
  if (!COLOUR_PROPS.test(d.prop)) return [];
  const known = (n: string): boolean => ROOT_COLOURS[n] !== undefined || LEGACY_ALIASES.includes(n);
  return [...d.value.matchAll(/var\(\s*(--[\w-]+)/g)]
    .map((m) => m[1] ?? "")
    .filter((n) => !known(n))
    .map((n) => violation(path, d.line, `${n} is not a Token`));
}

function namedViolations(path: string, d: CssDeclaration): Violation[] {
  if (!COLOUR_PROPS.test(d.prop)) return [];
  const named = d.value
    .toLowerCase()
    .replace(/var\([^)]*\)/g, " ")
    .split(/[\s,()/]+/)
    .filter((t) => NAMED_COLOURS.has(t));
  return named.length > 0
    ? [violation(path, d.line, `named colour ${named.join(" ")} is not a Token`)]
    : [];
}

function tokenValueViolations(path: string, d: CssDeclaration): Violation[] {
  const expected = ROOT_COLOURS[d.prop];
  if (!isRootToken(d) || expected === undefined) return [];
  return squash(d.value) === squash(expected)
    ? []
    : [violation(path, d.line, `${d.prop} must be ${expected}`)];
}

/**
 * Colour scan for every sheet outside the Pane. A colour literal is allowed only on the `:root`
 * declaration of the Token that has that value; `var(--x)` in a colour property must name a Token
 * or a temporary alias. Pane_Files are left to the Pane checks.
 */
export function colourViolations(sheets: readonly Sheet[]): Violation[] {
  return sheets
    .filter((s) => !isPaneFile(s.path))
    .flatMap((s) =>
      parseCss(s.text).declarations.flatMap((d) => {
        const own = literalViolations(s.path, d);
        const wrongValue = own.length === 0 ? tokenValueViolations(s.path, d) : [];
        return [...own, ...wrongValue, ...varViolations(s.path, d), ...namedViolations(s.path, d)];
      }),
    )
    .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}
