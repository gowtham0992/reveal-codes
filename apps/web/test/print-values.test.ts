import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";
import { parseTokenSheet } from "./static/css-colours";

/** Requirements 1.7, 2.12, 12.7: the print view renders the values it had before the redesign. */
const read = (path: string): string => readFileSync(join(WEB_ROOT, path), "utf8");
const tokens = parseTokenSheet(read("app/globals.css"));
const css = parseCss(read("src/components/print-view.module.css"));

/** Replaces every var(--x) by the value of the Token, following nested references. */
function resolve(value: string, depth = 0): string {
  if (depth > 5) throw new Error(`var() nesting too deep in ${value}`);
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_m, name: string) => {
    const found = tokens[name];
    if (found === undefined) throw new Error(`${name} is not declared in :root`);
    return resolve(found, depth + 1);
  });
}

const resolved = (selector: string, prop: string): string => {
  const d = css.declarations.find(
    (x) => x.selector.trim() === selector && x.prop === prop && x.atRules.length === 0,
  );
  if (d === undefined) throw new Error(`${selector} { ${prop} } not found`);
  return resolve(d.value).replace(/\s+/g, " ").toLowerCase();
};

const SERIF = 'georgia, "times new roman", serif';
const MONO = "ui-monospace, menlo, consolas, monospace";

describe("print view resolved values _Requirements: 1.7, 2.12, 12.7_", () => {
  it("paints the page white on #111111", () => {
    expect(resolved(".page", "background")).toBe("#ffffff");
    expect(resolved(".page", "color")).toBe("#111111");
  });

  it("draws rules in #b0b0b0 and table borders in #111111", () => {
    expect(resolved(".controls", "border-bottom")).toBe("1px solid #b0b0b0");
    expect(resolved(".item", "border-top")).toBe("1px solid #b0b0b0");
    expect(resolved(".table th, .table td", "border")).toBe("1px solid #111111");
  });

  it("sets the serif text at 12pt with line height 1.5", () => {
    expect(resolved(".serif", "font-family")).toBe(SERIF);
    expect(resolved(".serif", "font-size")).toBe("12pt");
    expect(resolved(".serif", "line-height")).toBe("1.5");
  });

  it("sets the monospace text at 13px", () => {
    expect(resolved(".mono", "font-family")).toBe(MONO);
    expect(resolved(".mono", "font-size")).toBe("13px");
    expect(resolved(".appendixLines", "font-family")).toBe(MONO);
    expect(resolved(".appendixLines", "font-size")).toBe("13px");
  });

  it("keeps the page width on --page-max, 8.5in", () => {
    expect(resolved(".page", "max-width")).toBe("8.5in");
  });
});
