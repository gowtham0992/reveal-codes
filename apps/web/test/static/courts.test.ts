import { describe, expect, it } from "vitest";
import { parseCss } from "../support/css";
import { formatViolations, readSources, violation } from "../support/scan";
import { colourViolations } from "./css-colours";
import { sheetViolations } from "./page-css";
/** Requirements 10.2, 10.3, 10.4, 16.10, 16.14: the Courts page sources sit inside the static scans. */
const COURTS = /^(?:app|src)\/courts\//;
const sheets = readSources(["app", "src"], /\.css$/).filter((s) => COURTS.test(s.path));
const sources = readSources(["app", "src"]).filter((s) => COURTS.test(s.path));
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
  it("sets the desk wrapper, the paper column and 34px links _Requirements: 21.1, 21.7, 21.9_", () => {
    const css = parseCss(sheets[0]?.text ?? "");
    const value = (selector: string, prop: string): string | undefined =>
      css.declarations.find((d) => d.selector.trim() === selector && d.prop === prop)?.value.trim();
    expect(value(".desk", "min-height")).toBe("100vh");
    expect(value(".desk", "background")).toBe("var(--desk)");
    expect(value(".page", "max-width")).toBe("var(--page-max)");
    expect(value(".page", "min-height")).toBe("100vh");
    expect(value(".page", "margin")).toBe("0 auto");
    expect(value(".page", "background")).toBe("var(--paper)");
    expect(value(".page", "box-sizing")).toBe("border-box");
    expect(css.atRules.filter((r) => /width/.test(r.prelude))).toEqual([]);
    expect(value(".links a", "min-height")).toBe("34px");
    expect(value(".links a", "display")).toBe("inline-flex");
    expect(value(".links a", "align-items")).toBe("center");
  });

  it("puts the 44px link height under the touch query and 34px outside it _Requirements: 20.5, 20.7, 20.8_", () => {
    const css = parseCss(sheets[0]?.text ?? "");
    const links = css.declarations.filter(
      (d) => d.selector.trim() === ".links a" && d.prop === "min-height",
    );
    const coarse = links.filter((d) => d.atRules.includes("@media (pointer: coarse)"));
    const desktop = links.filter((d) => d.atRules.length === 0);
    expect(coarse.map((d) => d.value.trim())).toEqual(["44px"]);
    expect(desktop.map((d) => d.value.trim())).toEqual(["34px"]);
    expect(css.atRules.filter((r) => /width/.test(r.prelude))).toEqual([]);
    expect(css.atRules.map((r) => r.prelude)).toEqual(["@media (pointer: coarse)"]);
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
