import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

describe("Small-screen stylesheet _Requirements: 9.4, 9.5, 9.6, 9.7, 13.10_", () => {
  const text = readFileSync(join(WEB_ROOT, "src/components/small-screen-page.module.css"), "utf8");
  const css = parseCss(text);
  const value = (selector: string, prop: string): string | undefined =>
    css.declarations.find((d) => d.selector === selector && d.prop === prop)?.value;

  it("sets the page on paper with 40px 28px padding", () => {
    expect(value(".page", "background")).toBe("var(--paper)");
    expect(value(".page", "color")).toBe("var(--ink)");
    expect(value(".page", "padding")).toBe("40px 28px");
  });

  it("styles the wordmark like the toolbar's, over a 3px double ink rule", () => {
    expect(value(".wordmark", "border-bottom")).toBe("3px double var(--ink)");
    expect(value(".wordmark", "font-size")).toBe("15px");
    expect(value(".wordmark", "font-weight")).toBe("400");
    expect(value(".wordmark", "text-transform")).toBe("uppercase");
    expect(value(".wordmark", "letter-spacing")).toBe("0.16em");
    expect(value(".wordmark", "padding-bottom")).toBe("12px");
    expect(value(".wordmark", "margin-bottom")).toBe("24px");
  });

  it("sets the sentences in the editor face at 18px/29px", () => {
    expect(value(".page p", "font-family")).toBe("var(--font-editor)");
    expect(value(".page p", "font-size")).toBe("18px");
    expect(value(".page p", "line-height")).toBe("29px");
  });

  it("uses none of the removed aliases", () => {
    expect(text).not.toMatch(/--ui-bg|--accent|--size-/);
  });
});
