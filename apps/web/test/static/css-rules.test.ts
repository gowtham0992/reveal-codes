import { describe, expect, it } from "vitest";
import { parseCss, type CssDeclaration } from "../support/css";
import { formatViolations, readSources, violation, type Violation } from "../support/scan";
import { colourViolations, type Sheet } from "./css-colours";

/** Requirements 10.9, 10.11 to 10.15 (UI stylesheets) and 12.2 to 12.5 (Pane stylesheet). */
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
  "--font-ui": '"Public Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  "--font-editor": '"Libre Caslon Text", Georgia, "Times New Roman", serif',
  "--font-pane": '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
  "--print-font-text": 'Georgia, "Times New Roman", serif',
  "--print-font-mono": "ui-monospace, Menlo, Consolas, monospace",
};
const VARIABLE_VALUES: Readonly<Record<string, string>> = {
  "--page-max": "8.5in",
  "--toolbar-h": "32px",
  "--status-h": "22px",
  "--strip-w": "32px",
  "--left-w": "260px",
  "--right-w": "300px",
  "--pane-h": "40vh",
  "--shell-min": "1150px",
  "--control-h": "30px",
  "--button-pad": "4px 10px",
  "--size-ui": "13px",
  "--size-editor": "12pt",
  "--size-pane": "14px",
  "--size-wordmark": "15px",
  "--size-status": "12px",
  "--line-editor": "1.5",
};
/** Pane code families, keyed by class name lowercased with non-letters removed. */
const FAMILY_COLOURS: Readonly<Record<string, readonly [string, string]>> = {
  hum: ["#FFFFFF", "#0000AA"],
  pst: ["#FFFF55", "#0000AA"],
  ai: ["#FF55FF", "#0000AA"],
  aihum: ["#55FFFF", "#0000AA"],
  verified: ["#55FF55", "#0000AA"],
  failing: ["#FFFFFF", "#AA0000"],
  header: ["#0000AA", "#AAAAAA"],
  pending: ["#AA5500", "#FFFF55"],
  ovr: ["#555555", "#AAAAAA"],
  ref: ["#AAAAAA", "#0000AA"],
  close: ["#FFFFFF", "#0000AA"],
  cursor: ["#0000AA", "#AAAAAA"],
  status: ["#AAAAAA", "#0000AA"],
  statusline: ["#AAAAAA", "#0000AA"],
};
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const FOCUS_OUTLINE = /^2px solid var\(--(?:oxblood|accent)\)$/;

const norm = (v: string): string =>
  v
    .trim()
    .replace(/\s+/g, " ")
    .replace(/'/g, '"')
    .replace(/\s*,\s*/g, ", ");
const byLine = (v: Violation[]): Violation[] => v.sort((a, b) => a.line - b.line);
const at = (path: string, d: CssDeclaration, message: string): Violation =>
  violation(path, d.line, message);

function cgaViolations(path: string, decls: CssDeclaration[]): Violation[] {
  const found: Violation[] = [];
  for (const d of decls) {
    for (const hex of d.value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      if (!CGA.has(hex.toUpperCase()))
        found.push(at(path, d, `colour ${hex} is not in the palette`));
    }
    if (COLOUR_FUNCTION.test(d.value)) found.push(at(path, d, "colour function is not allowed"));
  }
  return found;
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
  const sizes = [
    "var(--size-ui)",
    "13px",
    "inherit",
    "15px",
    "var(--size-wordmark)",
    "12px",
    "var(--size-status)",
  ];
  if (/(?:editor-surface|print-view)\.module\.css$/.test(path))
    sizes.push("var(--size-editor)", "12pt");
  for (const d of decls) {
    const value = norm(d.value);
    const stack = FONT_STACKS[d.prop];
    if (d.prop.startsWith("--font-") && stack === undefined)
      found.push(at(path, d, "fourth font family"));
    if (stack !== undefined && value !== stack)
      found.push(at(path, d, `${d.prop} is not the specified stack`));
    const familyOk =
      /^(?:var\(--(?:font-(?:ui|editor|pane)|print-font-(?:text|mono))\)|inherit)$/.test(value);
    if (d.prop === "font-family" && !familyOk) {
      found.push(at(path, d, "font-family must be one of the three variables"));
    }
    if (d.prop === "font" && value !== "inherit") found.push(at(path, d, "font shorthand"));
    if (d.prop === "font-weight" && !/^(?:400|500|600|700|normal|bold|inherit)$/.test(value)) {
      found.push(at(path, d, "font-weight must be 400, 500, 600 or 700"));
    }
    if (d.prop === "font-size" && !sizes.includes(value))
      found.push(at(path, d, "font-size must be 12px, 13px or 15px"));
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
    const hoverOk =
      /^background(?:-color)?$/.test(d.prop) ||
      (d.prop === "color" && sel.includes('[data-primary="true"]'));
    if (sel.includes(":hover") && !hoverOk) {
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
    ...cgaViolations(sheet.path, css.declarations),
    ...familyViolations(sheet.path, css.declarations),
    ...smoothing,
  ]);
}

const sheets = readSources(["app", "src"], /\.css$/);
const isPane = (s: Sheet): boolean => /^src\/pane\//.test(s.path);

describe("static: stylesheets _Requirements: 10.9, 10.11, 10.12, 10.13, 10.14, 10.15, 12.2, 12.3, 12.4, 12.5_", () => {
  it("keeps every UI stylesheet inside the Tokens, type, control and focus rules", () => {
    const ui = sheets.filter((s) => !isPane(s));
    expect(formatViolations(ui.flatMap(checkUiSheet))).toEqual([]);
    expect(formatViolations(colourViolations(ui))).toEqual([]);
  });

  it("keeps the Pane stylesheet on the CGA palette and the code-family table", () => {
    expect(formatViolations(sheets.filter(isPane).flatMap(checkPaneSheet))).toEqual([]);
  });
});

const PANE_ONLY_COLOURS = /#(?:AAAAAA|AA0000)(?![0-9a-fA-F])/gi;

/** Requirement 3.7: #AAAAAA and #AA0000 appear only under src/pane/, in any letter case. */
function paneColourViolations(file: Sheet): Violation[] {
  if (/^src\/pane\//.test(file.path)) return [];
  return [...file.text.matchAll(PANE_ONLY_COLOURS)].map((m) =>
    violation(
      file.path,
      file.text.slice(0, m.index).split("\n").length,
      `${m[0]} is allowed only in src/pane/`,
    ),
  );
}

describe("static: Pane-only colours _Requirements: 3.7_", () => {
  it("keeps #AAAAAA and #AA0000 out of app/** and src/** outside src/pane/", () => {
    const files = readSources(["app", "src"], /\.(?:css|tsx?)$/);
    expect(formatViolations(files.flatMap(paneColourViolations))).toEqual([]);
  });

  it("reports planted violations in any letter case and allows the same text in src/pane/", () => {
    const text = ".a {\n  color: #aaaaaa;\n  background: #Aa0000;\n}\n";
    const path = "src/components/x.module.css";
    expect(formatViolations(paneColourViolations({ path, text }))).toEqual([
      `${path}:2 #aaaaaa is allowed only in src/pane/`,
      `${path}:3 #Aa0000 is allowed only in src/pane/`,
    ]);
    expect(paneColourViolations({ path: "app/x.ts", text: 'const c = "#AA0000";\n' })).toHaveLength(
      1,
    );
    expect(paneColourViolations({ path: "src/pane/pane.module.css", text })).toEqual([]);
  });
});

const PRIMARY_SEL = /\[data-primary/;
const PRIMARY_VALUE = /^var\(--(?:ink|paper)\)$/;
const PRIMARY_FORBIDDEN = /^(?:border.*|padding.*|transition.*|font-size|height)$/;

function primaryViolations(all: readonly Sheet[]): string[] {
  const found: string[] = [];
  const mentions = all.filter((s) => s.text.includes("data-primary")).map((s) => s.path);
  if (mentions.length !== 1 || mentions[0] !== "app/globals.css")
    found.push(`data-primary must appear only in app/globals.css, found in ${mentions.join(", ")}`);
  const global = all.find((s) => s.path === "app/globals.css");
  const decls = parseCss(global?.text ?? "").declarations;
  const rules = new Map<string, CssDeclaration[]>();
  for (const d of decls.filter((x) => PRIMARY_SEL.test(x.selector))) {
    rules.set(d.selector.trim(), [...(rules.get(d.selector.trim()) ?? []), d]);
  }
  const selectors = [...rules.keys()];
  const hover = selectors.filter((s) => s.includes(":hover"));
  if (selectors.length !== 2 || hover.length !== 1)
    found.push("expected exactly one rest and one hover rule with data-primary");
  for (const d of [...rules.values()].flat()) {
    if (!PRIMARY_VALUE.test(norm(d.value)))
      found.push(`${d.prop} must be var(--ink) or var(--paper)`);
    if (PRIMARY_FORBIDDEN.test(d.prop)) found.push(`${d.prop} is not allowed in a primary rule`);
    if (d.selector.includes(":hover") && !/^(?:background|color)$/.test(d.prop))
      found.push(`hover sets ${d.prop}`);
  }
  return [...found, ...buttonBaseViolations(decls)];
}

function buttonBaseViolations(decls: CssDeclaration[]): string[] {
  const base = decls.filter((d) => d.selector.trim() === "button");
  const value = (p: string): string => norm(base.find((d) => d.prop === p)?.value ?? "");
  return [
    ...(value("border") === "1px solid var(--ink)" ? [] : ["button border changed"]),
    ...(value("padding") === "var(--button-pad)" ? [] : ["button padding changed"]),
  ];
}

describe("static: primary button rule _Requirements: 4.6, 4.7, 4.9, 4.12, 12.4_", () => {
  it("defines the primary style once, in globals.css, with ink and paper only", () => {
    expect(primaryViolations(sheets)).toEqual([]);
  });

  it("reports a planted primary rule with a border, a transition and a stray colour", () => {
    const text =
      'button {\n  border: 1px solid var(--ink);\n  padding: var(--button-pad);\n}\nbutton[data-primary="true"]:not(:disabled) {\n  background: #111111;\n  border: 1px solid var(--ink);\n  transition: none;\n}\n';
    const found = primaryViolations([{ path: "app/globals.css", text }]);
    expect(found).toEqual([
      "expected exactly one rest and one hover rule with data-primary",
      "background must be var(--ink) or var(--paper)",
      "border must be var(--ink) or var(--paper)",
      "border is not allowed in a primary rule",
      "transition must be var(--ink) or var(--paper)",
      "transition is not allowed in a primary rule",
    ]);
  });
});

const WIDTH_QUERY = /\b(?:min|max)-width\b/;

function shellWidthViolations(all: readonly Sheet[]): string[] {
  const found: string[] = [];
  const widthRules = all.flatMap((s) =>
    parseCss(s.text)
      .atRules.filter((r) => WIDTH_QUERY.test(r.prelude))
      .map((r) => `${s.path}:${String(r.line)} ${r.prelude}`),
  );
  if (widthRules.length !== 1)
    found.push(`expected exactly one width at-rule, found ${String(widthRules.length)}`);
  const global = all.find((s) => s.path === "app/globals.css");
  const css = parseCss(global?.text ?? "");
  const hide = css.atRules.filter((r) => r.prelude === "@media (max-width: 799px)");
  if (hide.length !== 1) found.push("globals.css needs exactly one @media (max-width: 799px)");
  const hidden = css.declarations.filter(
    (d) =>
      d.atRules.includes("@media (max-width: 799px)") &&
      d.selector.trim() === ".app" &&
      d.prop === "display" &&
      norm(d.value) === "none",
  );
  if (hidden.length !== 1) found.push("the 799px rule must set display: none on .app");
  return found;
}

const normText = (t: string): string => t.replace(/\s+/g, " ");

describe("static: Shell width _Requirements: 10.1, 10.2, 10.3, 10.12, 10.13_", () => {
  it("has one width media query, the 799px hide rule on .app", () => {
    expect(shellWidthViolations(sheets)).toEqual([]);
  });

  it("reports a planted second width query and a missing hide rule", () => {
    const text = "@media (min-width: 900px) {\n  .app {\n    color: #111111;\n  }\n}\n";
    expect(shellWidthViolations([{ path: "app/globals.css", text }])).toEqual([
      "globals.css needs exactly one @media (max-width: 799px)",
      "the 799px rule must set display: none on .app",
    ]);
    const two = `${text}@media (max-width: 799px) {\n  .app {\n    display: none;\n  }\n}\n`;
    expect(shellWidthViolations([{ path: "app/globals.css", text: two }])).toEqual([
      "expected exactly one width at-rule, found 2",
    ]);
  });

  it("keeps the Status_Line in the editor column and the Issues_Region on rows 2 to 4", () => {
    const text = (p: string): string => normText(sheets.find((s) => s.path === p)?.text ?? "");
    expect(text("src/components/status-line.module.css")).toContain("grid-column: main;");
    expect(text("src/components/issues-region.module.css")).toContain("grid-row: 2 / 4;");
  });
});

const EXPORT_WIDTH = "width: min(560px, 100vw - 32px)";
describe("static: Export dialog width _Requirements: 9.1, 9.2, 9.8_", () => {
  it("defines the wide dialog width in modal.module.css and in no other sheet", () => {
    const holders = sheets.filter((s) => s.text.includes(EXPORT_WIDTH)).map((s) => s.path);
    expect(holders).toEqual(["src/components/modal.module.css"]);
  });
});
function ui(text: string, path = "src/components/x.module.css"): string[] {
  return formatViolations(checkUiSheet({ path, text }));
}

describe("static: stylesheet self-test (planted violations)", () => {
  it("reports hover that changes more than the background, and allows a focus outline", () => {
    expect(ui("a:hover {\n  color: var(--oxblood);\n}\n")).toEqual([
      "src/components/x.module.css:2 hover may change only the background",
    ]);
    expect(ui(".a:focus-visible {\n  outline: 2px solid var(--oxblood);\n}\n")).toEqual([]);
  });

  it("allows color on the primary hover selector only", () => {
    const primary =
      'button[data-primary="true"]:hover:not(:disabled) {\n  color: var(--white);\n}\n';
    expect(ui(primary)).toEqual([]);
    expect(ui("a:hover {\n  color: var(--ink);\n}\n")).toEqual([
      "src/components/x.module.css:2 hover may change only the background",
    ]);
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
      ".a {\n  font-family: Comic Sans MS;\n  font-weight: 300;\n  font-size: 14px;\n  outline: none;\n}\n";
    expect(ui(text)).toEqual([
      "src/components/x.module.css:2 font-family must be one of the three variables",
      "src/components/x.module.css:3 font-weight must be 400, 500, 600 or 700",
      "src/components/x.module.css:4 font-size must be 12px, 13px or 15px",
      "src/components/x.module.css:5 outline removed",
    ]);
  });

  it("accepts 12px and 15px and still reports 14px with its path and line", () => {
    expect(ui(".a {\n  font-size: 12px;\n}\n.b {\n  font-size: 15px;\n}\n")).toEqual([]);
    expect(ui(".a {\n  color: var(--ink);\n  font-size: 14px;\n}\n")).toEqual([
      "src/components/x.module.css:3 font-size must be 12px, 13px or 15px",
    ]);
  });

  it("reports button and focus rule violations in globals.css", () => {
    const text =
      ":root {\n  color-scheme: light;\n  --size-ui: 14px;\n}\nbutton {\n  border: 2px solid var(--ink);\n  padding: 8px;\n}\n:focus-visible {\n  outline: 1px solid var(--accent);\n}\n";
    expect(ui(text, "app/globals.css")).toEqual([
      "app/globals.css:3 --size-ui must be 13px",
      "app/globals.css:6 button border must be 1px solid ink",
      "app/globals.css:7 button padding must be 4px 10px",
      "app/globals.css:10 focus outline must be 2px solid accent",
    ]);
  });

  it("reports a stray global stylesheet and a missing color-scheme", () => {
    expect(ui(".a {\n  color: var(--ink);\n}\n", "src/other.css")).toEqual([
      "src/other.css:1 UI stylesheet is neither app/globals.css nor a CSS module",
    ]);
    expect(ui(":root {\n  --ink: #1b1915;\n}\n", "app/globals.css")).toEqual([
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
