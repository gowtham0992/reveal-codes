import { describe, expect, it } from "vitest";
import { parseCss, type CssDeclaration } from "../support/css";
import { readSources } from "../support/scan";

/** Requirements 5.2 to 5.8, 5.10, 5.11, 5.15, 5.16, 13.10 (the Sheet stylesheet). */
const SHEET_PATH = "src/components/editor-surface.module.css";
const sheet = readSources(["src"], /editor-surface\.module\.css$/).find(
  (s) => s.path === SHEET_PATH,
);
const decls = parseCss(sheet?.text ?? "").declarations;

const norm = (v: string): string => v.trim().replace(/\s+/g, " ");
const SELECTOR_PM = ".content :global(.ProseMirror)";

function valuesOf(selector: string, prop: string): string[] {
  return decls
    .filter((d) => norm(d.selector) === selector && d.prop === prop)
    .map((d) => norm(d.value));
}

const BANNED_ON_TEXT = /^(?:font-style|text-align|text-indent|padding(?:-.+)?)$/;

/** Every declaration reaching Document text must avoid italic, centring, indent, padding and margin. */
function documentTextViolations(all: readonly CssDeclaration[]): string[] {
  return all
    .filter((d) => d.selector.includes(".ProseMirror") && !d.selector.includes("::before"))
    .flatMap((d) => {
      const margin = /^margin(?:-.+)?$/.test(d.prop) && norm(d.value) !== "0";
      return BANNED_ON_TEXT.test(d.prop) || margin ? [`${d.selector.trim()} sets ${d.prop}`] : [];
    });
}

describe("static: no outline on the Editor content element _Requirements: focus_", () => {
  it("removes the outline from the content element when focused, and from no other element here", () => {
    expect(valuesOf(`${SELECTOR_PM}:focus`, "outline")).toEqual(["none"]);
    expect(valuesOf(`${SELECTOR_PM}:focus-visible`, "outline")).toEqual(["none"]);
    const others = decls.filter((d) => d.prop === "outline" && !d.selector.includes(SELECTOR_PM));
    expect(others).toEqual([]);
  });
  it("leaves the global focus outline for every control", () => {
    const globals = readSources(["app"], /globals\.css$/)[0];
    const rule = parseCss(globals?.text ?? "").declarations.filter(
      (d) => norm(d.selector) === ":focus-visible" && d.prop === "outline",
    );
    expect(rule.map((d) => norm(d.value))).toEqual(["2px solid var(--oxblood)"]);
  });
});
describe("static: Sheet stylesheet _Requirements: 5.2, 5.4, 5.5, 5.8, 5.10, 5.11, 13.10_", () => {
  it("finds the stylesheet", () => {
    expect(sheet).toBeDefined();
    expect(decls.length).toBeGreaterThan(0);
  });

  it("sets the Desk, the Sheet box and the Sheet type", () => {
    expect(valuesOf(".main", "background")).toEqual(["var(--desk)"]);
    expect(valuesOf(".page", "max-width")).toEqual(["var(--page-max)"]);
    expect(valuesOf(".page", "padding")).toEqual(["96px 96px 96px 104px"]);
    expect(valuesOf(".page", "border")).toEqual(["1px solid var(--rule)"]);
    expect(valuesOf(".page", "min-height")).toEqual(["11in"]);
    expect(valuesOf(".page", "margin")).toEqual(["24px auto"]);
    expect(valuesOf(".page", "font-family")).toEqual(["var(--font-editor)"]);
    expect(valuesOf(".page", "font-size")).toEqual(["14px"]);
    expect(valuesOf(".page", "line-height")).toEqual(["22px"]);
    expect(valuesOf(".page", "color")).toEqual(["var(--ink)"]);
  });

  it("resets the counter on .ProseMirror and increments it on its p", () => {
    expect(valuesOf(SELECTOR_PM, "counter-reset")).toEqual(["line"]);
    expect(valuesOf(`${SELECTOR_PM} p`, "counter-increment")).toEqual(["line"]);
    expect(valuesOf(`${SELECTOR_PM} p`, "position")).toEqual(["relative"]);
  });

  it("draws the number with p::before in the alt-text form after the plain form", () => {
    const sel = `${SELECTOR_PM} p::before`;
    expect(valuesOf(sel, "content")).toEqual(["counter(line)", 'counter(line) / ""']);
    expect(valuesOf(sel, "user-select")).toEqual(["none"]);
    expect(valuesOf(sel, "left")).toEqual(["-104px"]);
    expect(valuesOf(sel, "width")).toEqual(["62px"]);
    expect(valuesOf(sel, "text-align")).toEqual(["right"]);
    expect(valuesOf(sel, "color")).toEqual(["var(--muted)"]);
    expect(valuesOf(sel, "font-family")).toEqual(["var(--font-ui)"]);
    expect(valuesOf(sel, "font-size")).toEqual(["11px"]);
    expect(valuesOf(sel, "line-height")).toEqual(["22px"]);
  });

  it("places the double rule at 74px and the single rule 72px from the right", () => {
    expect(valuesOf(".page::before", "left")).toEqual(["74px"]);
    expect(valuesOf(".page::before", "width")).toEqual(["4px"]);
    expect(valuesOf(".page::before", "border-left")).toEqual(["1px solid var(--margin-rule)"]);
    expect(valuesOf(".page::before", "border-right")).toEqual(["1px solid var(--margin-rule)"]);
    expect(valuesOf(".page::after", "right")).toEqual(["72px"]);
    expect(valuesOf(".page::after", "width")).toEqual(["0"]);
    expect(valuesOf(".page::after", "border-left")).toEqual(["1px solid var(--rule-light)"]);
    for (const sel of [".page::before", ".page::after"]) {
      expect(valuesOf(sel, "top")).toEqual(["0"]);
      expect(valuesOf(sel, "bottom")).toEqual(["0"]);
    }
  });

  it("underlines issues in --fail and places the italic muted placeholder", () => {
    const issue = `${SELECTOR_PM} [data-issue]`;
    expect(valuesOf(issue, "text-decoration")).toEqual(["underline dotted var(--fail)"]);
    expect(valuesOf(".placeholder", "top")).toEqual(["96px"]);
    expect(valuesOf(".placeholder", "left")).toEqual(["104px"]);
    expect(valuesOf(".placeholder", "right")).toEqual(["96px"]);
    expect(valuesOf(".placeholder", "color")).toEqual(["var(--muted)"]);
    expect(valuesOf(".placeholder", "font-style")).toEqual(["italic"]);
  });
});

describe("static: Document text is never styled _Requirements: 5.16_", () => {
  it("has no italic, centring, indent, padding or margin other than 0 on .ProseMirror rules", () => {
    expect(documentTextViolations(decls)).toEqual([]);
  });

  it("reports a planted violation and ignores ::before and margin: 0", () => {
    const planted = parseCss(
      [
        ".a :global(.ProseMirror) p {\n  margin: 0;\n  text-indent: 2em;\n}",
        ".a :global(.ProseMirror) {\n  font-style: italic;\n  padding: 4px;\n  margin: 8px;\n  text-align: center;\n}",
        ".a :global(.ProseMirror) p::before {\n  text-align: right;\n  padding: 1px;\n}",
        ".placeholder {\n  font-style: italic;\n}",
      ].join("\n"),
    ).declarations;
    expect(documentTextViolations(planted)).toEqual([
      ".a :global(.ProseMirror) p sets text-indent",
      ".a :global(.ProseMirror) sets font-style",
      ".a :global(.ProseMirror) sets padding",
      ".a :global(.ProseMirror) sets margin",
      ".a :global(.ProseMirror) sets text-align",
    ]);
  });
});
