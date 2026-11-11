import { describe, expect, it } from "vitest";
import { parseCss, type CssDeclaration } from "../support/css";
import { formatViolations, readSources, violation, type Violation } from "../support/scan";
import { colourViolations, type Sheet } from "./css-colours";

/** Requirements 10.9, 10.11 to 10.15 (UI stylesheets) and 12.2 to 12.5 (Pane stylesheet). */
const FONT_STACKS: Readonly<Record<string, string>> = {
  "--font-ui": '"Public Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  "--font-editor": '"Libre Caslon Text", Georgia, "Times New Roman", serif',
  "--font-pane": '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
  "--print-font-text": 'Georgia, "Times New Roman", serif',
  "--print-font-mono": "ui-monospace, Menlo, Consolas, monospace",
};
/** Requirements 2.6 to 2.11, 10.5 to 10.7. */
const SIZES: ReadonlySet<string> = new Set([
  "10.5px",
  "11px",
  "12px",
  "12.5px",
  "13px",
  "13.5px",
  "14px",
  "15px",
  "18px",
  "20px",
  "26px",
  "12pt",
  "inherit",
]);
/** TEMPORARY: the size aliases of globals.css; removed together with them in task 5.1. */
const SIZE_ALIAS = /^var\(--size-(?:ui|editor|pane|wordmark|status)\)$/;
const WEIGHTS = /^(?:400|500|600|700|normal|bold|inherit)$/;
const VARIABLE_VALUES: Readonly<Record<string, string>> = {
  "--page-max": "8.5in",
  "--toolbar-h": "52px",
  "--status-h": "26px",
  "--strip-w": "32px",
  "--left-w": "260px",
  "--right-w": "300px",
  "--pane-h": "40vh",
  "--shell-min": "1150px",
  "--control-h": "30px",
  "--size-ui": "13px",
  "--size-editor": "12pt",
  "--size-pane": "14px",
  "--size-wordmark": "15px",
  "--size-status": "12px",
  "--line-editor": "1.5",
};
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i;
const FOCUS_OUTLINE = /^2px solid var\(--oxblood\)$/;

const norm = (v: string): string =>
  v
    .trim()
    .replace(/\s+/g, " ")
    .replace(/'/g, '"')
    .replace(/\s*,\s*/g, ", ");
const byLine = (v: Violation[]): Violation[] => v.sort((a, b) => a.line - b.line);
const at = (path: string, d: CssDeclaration, message: string): Violation =>
  violation(path, d.line, message);

const BANNED_PROP =
  /^(?:box-shadow|text-shadow|backdrop-filter|transition(?:-.+)?|animation(?:-.+)?|border(?:-[a-z]+)*-radius)$/;

function bannedViolations(path: string, css: ReturnType<typeof parseCss>): Violation[] {
  const found: Violation[] = [];
  for (const d of css.declarations) {
    const squareRadius = /^border(?:-[a-z]+)*-radius$/.test(d.prop) && d.value.trim() === "0";
    if (BANNED_PROP.test(d.prop) && !squareRadius)
      found.push(at(path, d, `${d.prop} is not allowed`));
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
    if (d.prop === "font-weight" && !WEIGHTS.test(value)) {
      found.push(at(path, d, "font-weight must be 400, 500, 600 or 700"));
    }
    if (d.prop === "font-size" && !SIZES.has(value) && !SIZE_ALIAS.test(value))
      found.push(at(path, d, `font-size must be one of ${[...SIZES].join(", ")}`));
  }
  return found;
}

function variableViolations(path: string, decls: CssDeclaration[]): Violation[] {
  return decls
    .filter(
      (d) =>
        VARIABLE_VALUES[d.prop] !== undefined &&
        // Component sheets set their own control height (24px list, 32px dialog); globals pins 30px.
        !(d.prop === "--control-h" && path !== "app/globals.css") &&
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
      found.push(at(path, d, "focus outline must be 2px solid oxblood"));
    }
    if (
      sel === "button" &&
      d.prop === "border" &&
      !/^1px solid (?:var\(--ink\)|#111111)$/i.test(value)
    ) {
      found.push(at(path, d, "button border must be 1px solid ink"));
    }
    if (
      sel === "button:disabled" &&
      /^(?:color|border|border-color)$/.test(d.prop) &&
      !/var\(--(?:disabled-border|disabled-fill|muted)\)/.test(value)
    ) {
      found.push(at(path, d, "disabled button must use the disabled tokens or muted"));
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

/** The ten Pane-only colour literals of the design, lowercase as Prettier writes them. */
const PANE_ALLOWED: ReadonlySet<string> = new Set([
  "#0f2766",
  "#2e4a8f",
  "#0a1c4f",
  "#e8ecf6",
  "#c9d2ec",
  "#bac4e2",
  "#f5d98b",
  "#a6d4f7",
  "#d7c6f5",
  "#9adbb0",
]);
const PANE_VARS: ReadonlySet<string> = new Set(["--ink", "--white", "--fail", "--fail-ring"]);
/** Pane code classes and the colours they set; `undefined` means the class sets none of that kind. */
const PANE_CLASSES: Readonly<Record<string, Readonly<{ color?: string; background?: string }>>> = {
  hum: { color: "#e8ecf6" },
  pst: { color: "#f5d98b" },
  ai: { color: "#a6d4f7" },
  aihum: { color: "#d7c6f5" },
  verified: { color: "#9adbb0" },
  pending: { color: "#bac4e2" },
  ref: { color: "#bac4e2" },
  ovr: { color: "#f5d98b" },
  close: { color: "#bac4e2" },
  cursor: { color: "#0f2766", background: "#e8ecf6" },
  block: { background: "var(--fail)" },
};

const lastClass = (selector: string): string | null => {
  const classes = [...selector.matchAll(/\.([\w-]+)/g)];
  return classes[classes.length - 1]?.[1] ?? null;
};

function paneLiteralViolations(path: string, decls: CssDeclaration[]): Violation[] {
  const found: Violation[] = [];
  for (const d of decls) {
    for (const hex of d.value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      if (!PANE_ALLOWED.has(hex.toLowerCase()))
        found.push(at(path, d, `colour ${hex} is not in the Pane colours`));
    }
    for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const name = m[1] ?? "";
      if (!PANE_VARS.has(name) && !/^--(?:font|size|line)-/.test(name))
        found.push(at(path, d, `${name} is not usable in the Pane stylesheet`));
    }
    if (COLOUR_FUNCTION.test(d.value)) found.push(at(path, d, "colour function is not allowed"));
  }
  return found;
}

function paneClassViolations(path: string, decls: CssDeclaration[]): Violation[] {
  const found: Violation[] = [];
  for (const d of decls) {
    const want = PANE_CLASSES[lastClass(d.selector) ?? ""];
    if (want === undefined || d.selector.trim().split(/\s+/).length > 1) continue;
    const expected =
      d.prop === "color"
        ? want.color
        : /^background(?:-color)?$/.test(d.prop)
          ? want.background
          : undefined;
    if (expected !== undefined && d.value.trim().toLowerCase() !== expected)
      found.push(at(path, d, `${d.selector} ${d.prop} must be ${expected}`));
  }
  return found;
}

function checkPaneSheet(sheet: Sheet): Violation[] {
  const css = parseCss(sheet.text);
  const smoothing = css.declarations
    .filter((d) => /font-smooth|osx-font-smoothing|text-rendering/.test(d.prop))
    .map((d) => at(sheet.path, d, `${d.prop} is not allowed in the Pane stylesheet`));
  return byLine([
    ...paneLiteralViolations(sheet.path, css.declarations),
    ...paneClassViolations(sheet.path, css.declarations),
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

  it("keeps the Pane stylesheet on the Pane colours and the class table", () => {
    expect(formatViolations(sheets.filter(isPane).flatMap(checkPaneSheet))).toEqual([]);
  });
});

const PRIMARY_SEL = /\[data-primary/;
const PRIMARY_REST: Readonly<Record<string, string>> = {
  background: "var(--oxblood)",
  "border-color": "var(--oxblood)",
  color: "var(--white)",
  "font-weight": "600",
};
const PRIMARY_HOVER: Readonly<Record<string, string>> = { background: "var(--ink)" };

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
    const allowed = d.selector.includes(":hover") ? PRIMARY_HOVER : PRIMARY_REST;
    const prop = d.prop.toLowerCase();
    if (allowed[prop] === undefined) found.push(`${d.prop} is not allowed in a primary rule`);
    else if (norm(d.value) !== allowed[prop])
      found.push(`${d.prop} must be ${allowed[prop] ?? ""}`);
  }
  return [...found, ...buttonBaseViolations(decls)];
}

function buttonBaseViolations(decls: CssDeclaration[]): string[] {
  const base = decls.filter((d) => d.selector.trim() === "button");
  const value = (p: string): string => norm(base.find((d) => d.prop === p)?.value ?? "");
  return [
    ...(value("border") === "1px solid var(--ink)" ? [] : ["button border changed"]),
    ...(value("height") === "var(--control-h)" ? [] : ["button height changed"]),
  ];
}

describe("static: primary button rule _Requirements: 4.6, 4.7, 4.9, 4.12, 12.4_", () => {
  it("defines the primary style once, in globals.css, with oxblood, white and ink only", () => {
    expect(primaryViolations(sheets)).toEqual([]);
  });

  it("reports a planted primary rule with a border, a transition and a stray colour", () => {
    const text =
      'button {\n  border: 1px solid var(--ink);\n  height: var(--control-h);\n}\nbutton[data-primary="true"]:not(:disabled) {\n  background: #111111;\n  border: 1px solid var(--ink);\n  transition: none;\n}\n';
    const found = primaryViolations([{ path: "app/globals.css", text }]);
    expect(found).toEqual([
      "expected exactly one rest and one hover rule with data-primary",
      "background must be var(--oxblood)",
      "border is not allowed in a primary rule",
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

const DIALOG_WIDTH = "width: min(600px, 100vw - 32px)";
describe("static: Dialog width _Requirements: 8.2, 13.10_", () => {
  it("defines the Dialog width in modal.module.css and in no other sheet", () => {
    const holders = sheets.filter((s) => s.text.includes(DIALOG_WIDTH)).map((s) => s.path);
    expect(holders).toEqual(["src/components/modal.module.css"]);
  });
});
const SIZE_MESSAGE = `font-size must be one of ${[...SIZES].join(", ")}`;
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
      ".a {\n  font-family: Comic Sans MS;\n  font-weight: 300;\n  font-size: 17px;\n  outline: none;\n}\n";
    expect(ui(text)).toEqual([
      "src/components/x.module.css:2 font-family must be one of the three variables",
      "src/components/x.module.css:3 font-weight must be 400, 500, 600 or 700",
      `src/components/x.module.css:4 ${SIZE_MESSAGE}`,
      "src/components/x.module.css:5 outline removed",
    ]);
  });

  it("accepts 13.5px and weight 600 and reports 17px with its path and line", () => {
    expect(ui(".a {\n  font-size: 13.5px;\n  font-weight: 600;\n}\n")).toEqual([]);
    expect(ui(".a {\n  color: var(--ink);\n  font-size: 17px;\n}\n")).toEqual([
      `src/components/x.module.css:3 ${SIZE_MESSAGE}`,
    ]);
  });

  it("accepts every listed size, the print pt size and the temporary size aliases", () => {
    const sizes = [...SIZES, "var(--size-ui)", "var(--size-editor)", "var(--size-status)"];
    expect(ui(sizes.map((s) => `.a {\n  font-size: ${s};\n}\n`).join(""))).toEqual([]);
  });

  it("accepts the five family variables and inherit, and reports a fourth font variable", () => {
    const families = ["--font-ui", "--font-editor", "--font-pane", "--print-font-text"];
    const ok = [...families.map((v) => `var(${v})`), "var(--print-font-mono)", "inherit"];
    expect(ui(ok.map((f) => `.a {\n  font-family: ${f};\n}\n`).join(""))).toEqual([]);
    expect(ui(":root {\n  --font-fourth: Papyrus, fantasy;\n}\n")).toEqual([
      "src/components/x.module.css:2 fourth font family",
    ]);
  });

  it("reports a font stack variable that differs from the specified stack", () => {
    expect(
      ui(':root {\n  --font-pane: "Fira Code", monospace;\n  --print-font-text: serif;\n}\n'),
    ).toEqual([
      "src/components/x.module.css:2 --font-pane is not the specified stack",
      "src/components/x.module.css:3 --print-font-text is not the specified stack",
    ]);
  });

  it("reports a changed size variable and a thick button border in globals.css", () => {
    const text =
      ":root {\n  color-scheme: light;\n  --size-ui: 14px;\n}\nbutton {\n  border: 2px solid var(--ink);\n  color: red;\n}\n";
    expect(ui(text, "app/globals.css")).toEqual([
      "app/globals.css:3 --size-ui must be 13px",
      "app/globals.css:6 button border must be 1px solid ink",
    ]);
  });

  it("reports a focus outline that is not 2px solid oxblood", () => {
    const text =
      ":root {\n  color-scheme: light;\n}\n:focus-visible {\n  outline: 1px solid var(--oxblood);\n}\n";
    expect(ui(text, "app/globals.css")).toEqual([
      "app/globals.css:5 focus outline must be 2px solid oxblood",
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

  it("reports an old CGA colour, a non-listed hex, a non-Pane variable, a wrong class colour and font smoothing in the Pane stylesheet", () => {
    const text =
      ".pane {\n  color: #123456;\n  background: #0000aa;\n  border-color: var(--rule);\n  -webkit-font-smoothing: antialiased;\n}\n.verified {\n  color: #55ff55;\n}\n.block {\n  background: var(--ink);\n}\n";
    expect(formatViolations(checkPaneSheet({ path: "src/pane/pane.module.css", text }))).toEqual([
      "src/pane/pane.module.css:2 colour #123456 is not in the Pane colours",
      "src/pane/pane.module.css:3 colour #0000aa is not in the Pane colours",
      "src/pane/pane.module.css:4 --rule is not usable in the Pane stylesheet",
      "src/pane/pane.module.css:5 -webkit-font-smoothing is not allowed in the Pane stylesheet",
      "src/pane/pane.module.css:8 colour #55ff55 is not in the Pane colours",
      "src/pane/pane.module.css:8 .verified color must be #9adbb0",
      "src/pane/pane.module.css:11 .block background must be var(--fail)",
    ]);
  });

  it("accepts the listed Pane colours and variables", () => {
    const text =
      ".cursor {\n  color: #0f2766;\n  background: #E8ECF6;\n}\n.block {\n  background: var(--fail);\n  outline: 2px solid var(--fail-ring);\n}\n";
    expect(checkPaneSheet({ path: "src/pane/pane.module.css", text })).toEqual([]);
  });
});
