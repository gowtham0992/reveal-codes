import { describe, expect, it } from "vitest";
import { parseCss } from "../support/css";
import { formatViolations, readSources, violation, type Violation } from "../support/scan";
import { colourViolations } from "./css-colours";
/** Requirements 10.2, 10.3, 10.4, 16.10, 16.14: the Courts page sources sit inside the static scans. */
const COURTS = /^(?:app|src)\/courts\//;
const sheets = readSources(["app", "src"], /\.css$/).filter((s) => COURTS.test(s.path));
const sources = readSources(["app", "src"]).filter((s) => COURTS.test(s.path));
const SIZES = new Set(["12px", "13px", "14px", "20px", "26px", "inherit"]);
const WEIGHTS = /^(?:400|500|600|700)$/;
const BANNED =
  /^(?:box-shadow|text-shadow|backdrop-filter|transition(?:-.+)?|animation(?:-.+)?|border(?:-[a-z]+)*-radius)$/;
const FIXED_WIDTH = /^(?:min-)?width$/;
function sheetViolations(path: string, text: string): Violation[] {
  const css = parseCss(text);
  const found = css.declarations.flatMap((d) => {
    const v = d.value.trim();
    const out: string[] = [];
    if (BANNED.test(d.prop)) out.push(`${d.prop} is not allowed`);
    if (/gradient\s*\(/i.test(v)) out.push("gradient");
    if (d.prop === "font-size" && !SIZES.has(v)) out.push(`font-size ${v}`);
    if (d.prop === "font-weight" && !WEIGHTS.test(v)) out.push(`font-weight ${v}`);
    if (FIXED_WIDTH.test(d.prop) && !/^(?:100%|auto|min-content|max-content|0)$/.test(v))
      out.push(`${d.prop} ${v} is a fixed width`);
    return out.map((m) => violation(path, d.line, m));
  });
  const queries = css.atRules
    .filter((r) => /\b(?:min|max)-width\b/.test(r.prelude))
    .map((r) => violation(path, r.line, `width query ${r.prelude}`));
  return [...found, ...queries];
}
describe("static: Courts page stylesheet _Requirements: 10.2, 10.3, 10.4_", () => {
  it("is scanned, and uses Tokens, allowed sizes and weights, and no width query or effect", () => {
    expect(sheets.map((s) => s.path)).toEqual(["app/courts/courts.module.css"]);
    expect(formatViolations(sheets.flatMap((s) => sheetViolations(s.path, s.text)))).toEqual([]);
    expect(formatViolations(colourViolations(sheets))).toEqual([]);
  });
  it("keeps the causes of a 320px overflow out: wrapping text and a list capped at 100%", () => {
    const css = parseCss(sheets[0]?.text ?? "");
    const value = (selector: string, prop: string): string | undefined =>
      css.declarations.find((d) => d.selector.trim() === selector && d.prop === prop)?.value.trim();
    expect(value(".page", "overflow-wrap")).toBe("anywhere");
    expect(value(".group", "max-width")).toBe("100%");
  });
  it("reports a planted fixed width, width query, shadow and off-list size", () => {
    const text =
      ".a {\n  width: 400px;\n  box-shadow: none;\n  font-size: 17px;\n}\n@media (min-width: 600px) {\n}\n";
    expect(formatViolations(sheetViolations("app/courts/x.module.css", text))).toEqual([
      "app/courts/x.module.css:2 width 400px is a fixed width",
      "app/courts/x.module.css:3 box-shadow is not allowed",
      "app/courts/x.module.css:4 font-size 17px",
      "app/courts/x.module.css:6 width query @media (min-width: 600px)",
    ]);
  });
});
describe("static: Courts page sources _Requirements: 16.10, 16.14_", () => {
  it("includes the page and the courts modules in the source scans", () => {
    const paths = sources.map((s) => s.path);
    expect(paths).toContain("app/courts/page.tsx");
    expect(paths).toContain("src/courts/courts-browser.tsx");
  });
  it("has no icon, emoji or image element in the Courts page sources", () => {
    const hits = sources.flatMap((s) =>
      s.text
        .split("\n")
        .flatMap((line, i) =>
          /\p{Extended_Pictographic}|<(?:svg|img|picture|canvas)\b/u.test(line)
            ? [violation(s.path, i + 1, "icon, emoji or image")]
            : [],
        ),
    );
    expect(formatViolations(hits)).toEqual([]);
  });
});
