import { describe, expect, it } from "vitest";
import { parseCss, type CssDeclaration } from "../support/css";
import { formatViolations, readSources, violation, type Violation } from "../support/scan";

/** Requirements 10.9, 10.11 to 10.15 (UI stylesheets) and 12.2 to 12.5 (Pane stylesheet). */
type Sheet = { readonly path: string; readonly text: string };

const UI_PALETTE = new Set(["#FFFFFF", "#111111", "#B0B0B0", "#ECECEC", "#1F3A8A"]);
const CGA = new Set([
  "#000000",
  "#0000AA",
  "#00AA00",
  "#00AAAA",
  "#AA0000",
  "#AA00AA",
  "#AA5500",
  "#AAAAAA",
  "#555555",
  "#5555FF",
  "#55FF55",
  "#55FFFF",
  "#FF5555",
  "#FF55FF",
  "#FFFF55",
  "#FFFFFF",
]);
const FONT_STACKS: Readonly<Record<string, string>> = {
  "--font-ui": '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  "--font-editor": 'Georgia, "Times New Roman", serif',
  "--font-pane": "ui-monospace, Menlo, Consolas, monospace",
};
const VARIABLE_VALUES: Readonly<Record<string, string>> = {
  "--paper": "#FFFFFF",
  "--ink": "#111111",
  "--rule": "#B0B0B0",
  "--ui-bg": "#ECECEC",
  "--accent": "#1F3A8A",
  "--size-ui": "13px",
  "--size-editor": "12pt",
  "--size-pane": "14px",
  "--line-editor": "1.5",
  "--page-max": "8.5in",
  "--toolbar-h": "32px",
  "--left-w": "260px",
  "--right-w": "300px",
  "--pane-h": "40vh",
  "--button-pad": "4px 10px",
};
/** Pane code families, keyed by class name lowercased with non-letters removed. */
const FAMILY_COLOURS: Readonly<Record<string, readonly [string, string]>> = {
  hum: ["#FFFFFF", "#0000AA"],
  pst: ["#FFFF55", "#0000AA"],
  ai: ["#FF55FF", "#0000AA"],
  aihum: ["#55FFFF", "#0000AA"],
  verified: ["#55FF55", "#0000AA"],
  failed: ["#FF5555", "#0000AA"],
  pending: ["#AA5500", "#FFFF55"],
  ovr: ["#555555", "#AAAAAA"],
  ref: ["#AAAAAA", "#0000AA"],
  close: ["#FFFFFF", "#0000AA"],
  cursor: ["#0000AA", "#AAAAAA"],
  status: ["#AAAAAA", "#0000AA"],
  statusline: ["#AAAAAA", "#0000AA"],
};
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
const LINK_SELECTOR = /(?:^|[\s>+~])a(?::[\w-]+(?:\([^)]*\))?)*$/;
const FOCUS_OUTLINE = /^2px solid (?:var\(--accent\)|#1F3A8A)$/i;

const norm = (v: string): string =>
  v
    .trim()
    .replace(/\s+/g, " ")
    .replace(/'/g, '"')
    .replace(/\s*,\s*/g, ", ");
const byLine = (v: Violation[]): Violation[] => v.sort((a, b) => a.line - b.line);
const at = (path: string, d: CssDeclaration, message: string): Violation =>
  violation(path, d.line, message);

function colourViolations(
  path: string,
  decls: CssDeclaration[],
  allowed: ReadonlySet<string>,
): Violation[] {
  const found: Violation[] = [];
  for (const d of decls) {
    for (const hex of d.value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      if (!allowed.has(hex.toUpperCase()))
        found.push(at(path, d, `colour ${hex} is not in the palette`));
    }
    if (COLOUR_FUNCTION.test(d.value)) found.push(at(path, d, "colour function is not allowed"));
    const named = d.value
      .toLowerCase()
      .split(/[\s,()/]+/)
      .filter((t) => NAMED_COLOURS.has(t));
    if (COLOUR_PROPS.test(d.prop) && named.length > 0) {
      found.push(at(path, d, `named colour ${named.join(" ")} is not in the palette`));
    }
  }
  return found;
}

function accentViolations(path: string, decls: CssDeclaration[]): Violation[] {
  return decls
    .filter((d) => /var\(--accent\)|#1F3A8A/i.test(d.value))
    .filter((d) => !["outline", "outline-color", "--accent"].includes(d.prop))
    .filter((d) => !d.selector.split(",").every((s) => LINK_SELECTOR.test(s.trim())))
    .map((d) => at(path, d, "accent used outside the focus outline and links"));
}

const BANNED_PROP =
  /^(?:box-shadow|text-shadow|backdrop-filter|transition(?:-.+)?|animation(?:-.+)?|border(?:-[a-z]+)*-radius)$/;

function bannedViolations(path: string, css: ReturnType<typeof parseCss>): Violation[] {
  const found: Violation[] = [];
  for (const d of css.declarations) {
    if (BANNED_PROP.test(d.prop)) found.push(at(path, d, `${d.prop} is not allowed`));
    if (/gradient\s*\(|drop-shadow/i.test(d.value))
      found.push(at(path, d, "gradient or shadow value"));
    if (/^outline(?:-style)?$/.test(d.prop) && /^(?:none|0)\b/.test(d.value.trim())) {
      found.push(at(path, d, "outline removed"));
    }
  }
  for (const rule of css.atRules) {
    if (/^@(?:keyframes|-webkit-keyframes)$/.test(rule.name)) {
      found.push(violation(path, rule.line, "@keyframes is not allowed"));
    }
    if (/prefers-color-scheme/.test(rule.prelude)) {
      found.push(violation(path, rule.line, "prefers-color-scheme is not allowed"));
    }
  }
  return found;
}

function typeViolations(path: string, decls: CssDeclaration[]): Violation[] {
  const found: Violation[] = [];
  const sizes = ["var(--size-ui)", "13px", "inherit"];
  if (path.endsWith("editor-surface.module.css")) sizes.push("var(--size-editor)", "12pt");
  for (const d of decls) {
    const value = norm(d.value);
    const stack = FONT_STACKS[d.prop];
    if (d.prop.startsWith("--font-") && stack === undefined)
      found.push(at(path, d, "fourth font family"));
    if (stack !== undefined && value !== stack)
      found.push(at(path, d, `${d.prop} is not the specified stack`));
    if (d.prop === "font-family" && !/^(?:var\(--font-(?:ui|editor|pane)\)|inherit)$/.test(value)) {
      found.push(at(path, d, "font-family must be one of the three variables"));
    }
    if (d.prop === "font" && value !== "inherit") found.push(at(path, d, "font shorthand"));
    if (d.prop === "font-weight" && !/^(?:400|700|normal|bold|inherit)$/.test(value)) {
      found.push(at(path, d, "font-weight must be 400 or 700"));
    }
    if (d.prop === "font-size" && !sizes.includes(value))
      found.push(at(path, d, "font-size must be 13px"));
  }
  return found;
}

function variableViolations(path: string, decls: CssDeclaration[]): Violation[] {
  return decls
    .filter(
      (d) =>
        VARIABLE_VALUES[d.prop] !== undefined &&
        norm(d.value).toUpperCase() !== VARIABLE_VALUES[d.prop]?.toUpperCase(),
    )
    .map((d) => at(path, d, `${d.prop} must be ${VARIABLE_VALUES[d.prop] ?? ""}`));
}

function controlViolations(path: string, decls: CssDeclaration[]): Violation[] {
  const found: Violation[] = [];
  for (const d of decls) {
    const value = norm(d.value);
    const sel = d.selector.trim();
    if (sel.includes(":hover") && !/^background(?:-color)?$/.test(d.prop)) {
      found.push(at(path, d, "hover may change only the background"));
    }
    if (sel.includes(":focus") && d.prop === "outline" && !FOCUS_OUTLINE.test(value)) {
      found.push(at(path, d, "focus outline must be 2px solid accent"));
    }
    if (
      sel === "button" &&
      d.prop === "border" &&
      !/^1px solid (?:var\(--ink\)|#111111)$/i.test(value)
    ) {
      found.push(at(path, d, "button border must be 1px solid ink"));
    }
    if (
      sel === "button" &&
      d.prop === "padding" &&
      !/^(?:var\(--button-pad\)|4px 10px)$/.test(value)
    ) {
      found.push(at(path, d, "button padding must be 4px 10px"));
    }
    if (
      sel === "button:disabled" &&
      /^(?:color|border|border-color)$/.test(d.prop) &&
      !/(?:var\(--rule\)|#B0B0B0)/i.test(value)
    ) {
      found.push(at(path, d, "disabled button must use rule grey"));
    }
  }
  return found;
}

function globalViolations(path: string, decls: CssDeclaration[]): Violation[] {
  if (path !== "app/globals.css" || decls.length === 0) return [];
  const find = (sel: string, prop: string): boolean =>
    decls.some((d) => d.selector.trim() === sel && d.prop === prop);
  const missing = (what: string): Violation[] => [
    violation(path, 1, `globals.css is missing ${what}`),
  ];
  return [
    ...(find(":root", "color-scheme") ? [] : missing(":root color-scheme: light")),
    ...(decls.some((d) => d.prop === "color-scheme" && norm(d.value) !== "light")
      ? missing("color-scheme: light (found another value)")
      : []),
  ];
}

function checkUiSheet(sheet: Sheet): Violation[] {
  const css = parseCss(sheet.text);
  const isModule = sheet.path.endsWith(".module.css");
  const shape =
    isModule || sheet.path === "app/globals.css"
      ? []
      : [violation(sheet.path, 1, "UI stylesheet is neither app/globals.css nor a CSS module")];
  return byLine([
    ...shape,
    ...colourViolations(sheet.path, css.declarations, UI_PALETTE),
    ...accentViolations(sheet.path, css.declarations),
    ...bannedViolations(sheet.path, css),
    ...typeViolations(sheet.path, css.declarations),
    ...variableViolations(sheet.path, css.declarations),
    ...controlViolations(sheet.path, css.declarations),
    ...globalViolations(sheet.path, css.declarations),
  ]);
}

function familyOf(selector: string): readonly [string, string] | null {
  const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((m) =>
    (m[1] ?? "").toLowerCase().replace(/[^a-z]/g, ""),
  );
  const last = classes[classes.length - 1];
  return last === undefined ? null : (FAMILY_COLOURS[last] ?? null);
}

function familyViolations(path: string, decls: CssDeclaration[]): Violation[] {
  const found: Violation[] = [];
  const bySelector = new Map<string, CssDeclaration[]>();
  for (const d of decls) bySelector.set(d.selector, [...(bySelector.get(d.selector) ?? []), d]);
  for (const [selector, rules] of bySelector) {
    const pair = familyOf(selector);
    const fg = rules.find((d) => d.prop === "color");
    const bg = rules.find((d) => /^background(?:-color)?$/.test(d.prop));
    if (pair === null || fg === undefined || bg === undefined) continue;
    if (fg.value.toUpperCase() !== pair[0])
      found.push(at(path, fg, `${selector} text must be ${pair[0]}`));
    if (bg.value.toUpperCase() !== pair[1])
      found.push(at(path, bg, `${selector} background must be ${pair[1]}`));
  }
  return found;
}

function checkPaneSheet(sheet: Sheet): Violation[] {
  const css = parseCss(sheet.text);
  const smoothing = css.declarations
    .filter((d) => /font-smooth|osx-font-smoothing|text-rendering/.test(d.prop))
    .map((d) => at(sheet.path, d, `${d.prop} is not allowed in the Pane stylesheet`));
  return byLine([
    ...colourViolations(sheet.path, css.declarations, CGA),
    ...familyViolations(sheet.path, css.declarations),
    ...smoothing,
  ]);
}

const sheets = readSources(["app", "src"], /\.css$/);
const isPane = (s: Sheet): boolean => /^src\/pane\//.test(s.path);

describe("static: stylesheets _Requirements: 10.9, 10.11, 10.12, 10.13, 10.14, 10.15, 12.2, 12.3, 12.4, 12.5_", () => {
  it("keeps every UI stylesheet inside the UI palette, type, control and focus rules", () => {
    const ui = sheets.filter((s) => !isPane(s));
    expect(formatViolations(ui.flatMap(checkUiSheet))).toEqual([]);
  });

  it("keeps the Pane stylesheet on the CGA palette and the code-family table", () => {
    expect(formatViolations(sheets.filter(isPane).flatMap(checkPaneSheet))).toEqual([]);
  });
});

function ui(text: string, path = "src/components/x.module.css"): string[] {
  return formatViolations(checkUiSheet({ path, text }));
}

describe("static: stylesheet self-test (planted violations)", () => {
  it("reports a colour outside the palette, a named colour and a colour function", () => {
    const text = ".a {\n  color: #123456;\n  background: red;\n  border-color: rgb(1, 2, 3);\n}\n";
    expect(ui(text)).toEqual([
      "src/components/x.module.css:2 colour #123456 is not in the palette",
      "src/components/x.module.css:3 named colour red is not in the palette",
      "src/components/x.module.css:4 colour function is not allowed",
    ]);
  });

  it("reports accent outside focus and links, but allows it in a link rule and an outline", () => {
    expect(ui(".a {\n  color: var(--accent);\n}\n")).toEqual([
      "src/components/x.module.css:2 accent used outside the focus outline and links",
    ]);
    expect(ui("a {\n  color: #1F3A8A;\n}\n")).toEqual([]);
    expect(ui("a:hover {\n  color: #1F3A8A;\n}\n")).toEqual([
      "src/components/x.module.css:2 hover may change only the background",
    ]);
    expect(ui(".a:focus-visible {\n  outline: 2px solid var(--accent);\n}\n")).toEqual([]);
  });

  it("reports banned properties, gradients and keyframes", () => {
    const text =
      ".a {\n  box-shadow: none;\n  border-radius: 2px;\n  transition: none;\n  background: linear-gradient(#FFFFFF, #ECECEC);\n}\n@keyframes spin {\n}\n";
    expect(ui(text)).toEqual([
      "src/components/x.module.css:2 box-shadow is not allowed",
      "src/components/x.module.css:3 border-radius is not allowed",
      "src/components/x.module.css:4 transition is not allowed",
      "src/components/x.module.css:5 gradient or shadow value",
      "src/components/x.module.css:7 @keyframes is not allowed",
    ]);
  });

  it("reports a fourth font family, a bad weight, a bad size and a removed outline", () => {
    const text =
      ".a {\n  font-family: Comic Sans MS;\n  font-weight: 600;\n  font-size: 14px;\n  outline: none;\n}\n";
    expect(ui(text)).toEqual([
      "src/components/x.module.css:2 font-family must be one of the three variables",
      "src/components/x.module.css:3 font-weight must be 400 or 700",
      "src/components/x.module.css:4 font-size must be 13px",
      "src/components/x.module.css:5 outline removed",
    ]);
  });

  it("reports button and focus rule violations in globals.css", () => {
    const text =
      ":root {\n  color-scheme: light;\n  --size-ui: 14px;\n}\nbutton {\n  border: 2px solid #111111;\n  padding: 8px;\n}\n:focus-visible {\n  outline: 1px solid var(--accent);\n}\n";
    expect(ui(text, "app/globals.css")).toEqual([
      "app/globals.css:3 --size-ui must be 13px",
      "app/globals.css:6 button border must be 1px solid ink",
      "app/globals.css:7 button padding must be 4px 10px",
      "app/globals.css:10 focus outline must be 2px solid accent",
    ]);
  });

  it("reports a stray global stylesheet and a missing color-scheme", () => {
    expect(ui(".a {\n  color: #111111;\n}\n", "src/other.css")).toEqual([
      "src/other.css:1 UI stylesheet is neither app/globals.css nor a CSS module",
    ]);
    expect(ui(":root {\n  --ink: #111111;\n}\n", "app/globals.css")).toEqual([
      "app/globals.css:1 globals.css is missing :root color-scheme: light",
    ]);
  });

  it("reports a non-CGA colour, a wrong family pair and font smoothing in the Pane stylesheet", () => {
    const text =
      ".pane {\n  color: #123456;\n  -webkit-font-smoothing: antialiased;\n}\n.verified {\n  color: #FF5555;\n  background: #0000AA;\n}\n";
    expect(formatViolations(checkPaneSheet({ path: "src/pane/pane.module.css", text }))).toEqual([
      "src/pane/pane.module.css:2 colour #123456 is not in the palette",
      "src/pane/pane.module.css:3 -webkit-font-smoothing is not allowed in the Pane stylesheet",
      "src/pane/pane.module.css:6 .verified text must be #55FF55",
    ]);
  });
});
