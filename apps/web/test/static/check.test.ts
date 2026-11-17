import { describe, expect, it } from "vitest";
import { parseCss } from "../support/css";
import { formatViolations, readSources, violation, type SourceText } from "../support/scan";
import { colourViolations } from "./css-colours";
import { sheetViolations } from "./page-css";

/** Requirements 3.10, 16.1, 16.2, 17.5: the Check_Page sources sit inside the static scans. */
const CHECK = /^(?:app|src)\/check\//;
const sheets = readSources(["app/check", "src/check"], /\.css$/);
const sources = readSources(["app/check", "src/check"]);
const globals = readSources(["app"], /^globals\.css$/)[0]?.text ?? "";

type Look = (selector: string, prop: string) => string | undefined;

function lookup(text: string): Look {
  const css = parseCss(text);
  return (selector, prop) =>
    css.declarations.find((d) => d.selector.trim() === selector && d.prop === prop)?.value.trim();
}

/** A width at-rule, in any sheet. */
function widthAtRules(file: SourceText): string[] {
  return parseCss(file.text)
    .atRules.filter((r) => /width/.test(r.prelude))
    .map((r) => `${file.path}:${String(r.line)} ${r.prelude}`);
}

const BANNED_SOURCE: readonly (readonly [RegExp, string])[] = [
  [/\p{Extended_Pictographic}/u, "icon or emoji"],
  [/<(?:img|svg|picture|canvas)\b/, "image element"],
  [/\b(?:localStorage|sessionStorage|indexedDB)\b/, "browser storage"],
  [/\bdocument\.cookie\b/, "cookie"],
];

function sourceViolations(files: readonly SourceText[]): string[] {
  return formatViolations(
    files.flatMap((f) =>
      f.text
        .split("\n")
        .flatMap((line, i) =>
          BANNED_SOURCE.filter(([pattern]) => pattern.test(line)).map(([, what]) =>
            violation(f.path, i + 1, what),
          ),
        ),
    ),
  );
}

describe("static: Check_Page stylesheet _Requirements: 16.1, 16.2, 17.5_", () => {
  it("is scanned, and uses Tokens, allowed sizes and weights, and no width query or effect", () => {
    expect(sheets.map((s) => s.path)).toEqual(["app/check/check.module.css"]);
    expect(formatViolations(sheets.flatMap((s) => sheetViolations(s.path, s.text)))).toEqual([]);
    expect(formatViolations(colourViolations(sheets))).toEqual([]);
  });

  it("holds no width at-rule", () => {
    expect(sheets.flatMap(widthAtRules)).toEqual([]);
  });

  it("keeps the causes of a 320px overflow out: wrapping text and a group capped at 100%", () => {
    const value = lookup(sheets[0]?.text ?? "");
    expect(value(".page", "overflow-wrap")).toBe("anywhere");
    expect(value(".group", "max-width")).toBe("100%");
  });

  it("sets the desk wrapper, the paper column and 34px links", () => {
    const value = lookup(sheets[0]?.text ?? "");
    expect(value(".desk", "min-height")).toBe("100vh");
    expect(value(".desk", "background")).toBe("var(--desk)");
    expect(value(".page", "max-width")).toBe("var(--page-max)");
    expect(value(".page", "min-height")).toBe("100vh");
    expect(value(".page", "margin")).toBe("0 auto");
    expect(value(".page", "background")).toBe("var(--paper)");
    expect(value(".page", "box-sizing")).toBe("border-box");
    expect(value(".links a", "min-height")).toBe("34px");
    expect(value(".links a", "display")).toBe("inline-flex");
    expect(value(".links a", "align-items")).toBe("center");
  });

  it("gives the text area the one oxblood focus border and does not override it", () => {
    const global = lookup(globals);
    expect(global("textarea", "border")).toBe("1px solid var(--ink)");
    expect(global("textarea:focus", "border")).toBe("2px solid var(--oxblood)");
    expect(global("textarea:focus", "outline")).toBe("none");
    const own = parseCss(sheets[0]?.text ?? "").declarations.filter((d) =>
      /^\.draft(?::|$)/.test(d.selector.trim()),
    );
    expect(own.filter((d) => /^(?:border|outline|padding)/.test(d.prop))).toEqual([]);
  });

  it("puts the 44px rules under the touch query and the 34px rule outside it _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.7_", () => {
    const decls = parseCss(sheets[0]?.text ?? "").declarations;
    const at = (selector: string, prop: string, coarse: boolean): string[] =>
      decls
        .filter(
          (d) =>
            d.selector.split(",").some((s) => s.trim() === selector) &&
            d.prop === prop &&
            d.atRules.includes("@media (pointer: coarse)") === coarse,
        )
        .map((d) => d.value.trim());
    expect(at(".page button", "height", true)).toEqual(["44px"]);
    expect(at(".page a", "min-height", true)).toEqual(["44px"]);
    expect(at(".page a", "display", true)).toEqual(["inline-flex"]);
    expect(at(".links a", "min-height", false)).toEqual(["34px"]);
    expect(at(".links a", "min-height", true)).toEqual(["44px"]);
    expect(decls.filter((d) => d.value.trim() === "44px" && d.atRules.length === 0)).toEqual([]);
    expect(decls.filter((d) => d.atRules.length > 0).every((d) => d.atRules.length === 1)).toBe(
      true,
    );
  });

  it("sets the Draft_Box text at 16px / 22px outside any query _Requirements: 20.7, 20.10_", () => {
    const value = lookup(sheets[0]?.text ?? "");
    expect(value(".draft", "font-size")).toBe("16px");
    expect(value(".draft", "line-height")).toBe("22px");
    const sixteen = parseCss(sheets[0]?.text ?? "").declarations.filter(
      (d) => d.prop === "font-size" && d.value.trim() === "16px",
    );
    expect(sixteen.map((d) => d.selector.trim())).toEqual([".draft"]);
  });

  it("allows only the touch query as a non-width media query, and 16px only on .draft or textarea", () => {
    const scan = (text: string): string[] =>
      formatViolations(sheetViolations("app/check/x.module.css", text));
    for (const q of ["(hover: none)", "(pointer: fine)"]) {
      expect(scan(`@media ${q} {\n}\n`)).toEqual([
        `app/check/x.module.css:1 media query @media ${q} is not allowed`,
      ]);
    }
    const touch = "@media (pointer: coarse) {\n  .page button {\n    height: 44px;\n  }\n}\n";
    expect(scan(touch)).toEqual([]);
    expect(widthAtRules({ path: "app/check/x.module.css", text: touch })).toEqual([]);
    expect(scan(".draft {\n  font-size: 16px;\n}\n")).toEqual([]);
    expect(scan(".a {\n  font-size: 16px;\n}\n")).toEqual([
      "app/check/x.module.css:2 font-size 16px",
    ]);
  });

  it("reports a planted width query, fixed width and width at-rule", () => {
    const text = ".a {\n  width: 320px;\n}\n@media (min-width: 600px) {\n}\n";
    expect(formatViolations(sheetViolations("app/check/x.module.css", text))).toEqual([
      "app/check/x.module.css:2 width 320px is a fixed width",
      "app/check/x.module.css:4 width query @media (min-width: 600px)",
    ]);
    expect(widthAtRules({ path: "app/check/x.module.css", text })).toEqual([
      "app/check/x.module.css:4 @media (min-width: 600px)",
    ]);
  });
});

describe("static: Check_Page sources _Requirements: 3.10, 16.2_", () => {
  it("includes the page and the check modules in the scans", () => {
    const paths = sources.map((s) => s.path);
    expect(paths).toContain("app/check/page.tsx");
    expect(paths).toContain("src/check/check-page.tsx");
    expect(sources.every((s) => CHECK.test(s.path))).toBe(true);
  });

  it("has no icon, emoji, image, browser storage or cookie", () => {
    expect(sourceViolations(sources)).toEqual([]);
  });

  it("reports each planted violation with path and line", () => {
    const text = [
      "const a = <img src='x' />;",
      "const b = <svg />;",
      "const c = '\u{1F600}';",
      "localStorage.getItem('k');",
      "sessionStorage.clear();",
      "document.cookie = 'a';",
      "indexedDB.open('d');",
      "const ok = '\u2713 \u2718 \u2260 ?';",
      "",
    ].join("\n");
    expect(sourceViolations([{ path: "src/check/x.tsx", text }])).toEqual([
      "src/check/x.tsx:1 image element",
      "src/check/x.tsx:2 image element",
      "src/check/x.tsx:3 icon or emoji",
      "src/check/x.tsx:4 browser storage",
      "src/check/x.tsx:5 browser storage",
      "src/check/x.tsx:6 cookie",
      "src/check/x.tsx:7 browser storage",
    ]);
  });
});
