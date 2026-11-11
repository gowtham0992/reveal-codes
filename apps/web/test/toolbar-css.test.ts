import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";
describe("Toolbar stylesheet _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_", () => {
  const read = (path: string) => parseCss(readFileSync(join(WEB_ROOT, path), "utf8"));
  const toolbar = read("src/components/toolbar.module.css");
  const globals = read("app/globals.css");
  const value = (selector: string, prop: string): string | undefined =>
    toolbar.declarations.find((d) => d.selector === selector && d.prop === prop)?.value;
  it("sets the grid row to 52px", () => {
    const row = globals.declarations.find((d) => d.prop === "--toolbar-h");
    expect(row?.value).toBe("52px");
  });
  it("draws a panel row with a 3px double ink bottom border", () => {
    expect(value(".toolbar", "background")).toBe("var(--panel)");
    expect(value(".toolbar", "border-bottom")).toBe("3px double var(--ink)");
  });
  it("sets the wordmark in upper-case Libre Caslon with letter spacing", () => {
    expect(value(".wordmark", "font-family")).toBe("var(--font-editor)");
    expect(value(".wordmark", "font-size")).toBe("15px");
    expect(value(".wordmark", "font-weight")).toBe("400");
    expect(value(".wordmark", "text-transform")).toBe("uppercase");
    expect(value(".wordmark", "letter-spacing")).toBe("0.16em");
  });
  it("puts 24px either side of the 1px rule", () => {
    expect(value(".wordmark", "margin-right")).toBe("24px");
    expect(value(".wordmark", "padding-right")).toBe("24px");
    expect(value(".wordmark", "border-right")).toBe("1px solid var(--rule)");
  });
  it("draws the notice muted at 12.5px", () => {
    expect(value(".notice", "color")).toBe("var(--muted)");
    expect(value(".notice", "font-size")).toBe("12.5px");
  });
  it("uses no removed alias and keeps the 8px gaps", () => {
    const text = readFileSync(join(WEB_ROOT, "src/components/toolbar.module.css"), "utf8");
    expect(text).not.toMatch(/--ui-bg|--size-|--accent/);
    expect(value(".toolbar", "gap")).toBe("8px");
    expect(value(".group", "gap")).toBe("8px");
  });
});
