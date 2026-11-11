import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

function luminance(hex: string | undefined): number {
  if (hex === undefined || !/^#[0-9a-f]{6}$/i.test(hex))
    throw new Error(`not a colour: ${String(hex)}`);
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, lighter luminance first. */
function contrast(a: string | undefined, b: string | undefined): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("Pane stylesheet _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.11, 7.12, 7.18, 10.4, 10.12_", () => {
  const css = parseCss(readFileSync(join(WEB_ROOT, "src/pane/pane.module.css"), "utf8"));
  // Prettier lowercases hex digits; compare case-insensitively.
  const rule = (selector: string, prop: string): string | undefined =>
    css.declarations
      .find((d) => d.selector === selector && d.prop === prop)
      ?.value.replace(/#[0-9a-f]{6}/gi, (h) => h.toUpperCase());

  it.each([
    ["hum", "#E8ECF6"],
    ["pst", "#F5D98B"],
    ["ai", "#A6D4F7"],
    ["aihum", "#D7C6F5"],
    ["verified", "#9ADBB0"],
    ["pending", "#BAC4E2"],
    ["ref", "#BAC4E2"],
    ["ovr", "#F5D98B"],
    ["close", "#BAC4E2"],
  ])("%s is coloured text %s with no background", (name, fg) => {
    expect(rule(`.${name}`, "color")).toBe(fg);
    expect(rule(`.${name}`, "background")).toBeUndefined();
  });

  it("draws failing codes white at weight 700 and a block white on --fail", () => {
    expect(rule(".failing", "color")).toBe("var(--white)");
    expect(rule(".failing", "font-weight")).toBe("700");
    expect(rule(".block", "background")).toBe("var(--fail)");
    expect(rule(".block", "color")).toBe("var(--white)");
    expect(rule(".block", "font-weight")).toBe("700");
    expect(rule(".block .code", "color")).toBe("inherit");
  });

  it("rings a block with 2px and a Legend failing entry with 1px of --fail-ring", () => {
    expect(rule(".block", "outline")).toBe("2px solid var(--fail-ring)");
    expect(rule(".legendBlock", "background")).toBe("var(--fail)");
    expect(rule(".legendBlock", "outline")).toBe("1px solid var(--fail-ring)");
  });

  it("gives codes weight 600 and no outline box", () => {
    expect(rule(".code", "font-weight")).toBe("600");
    expect(rule(".code", "outline")).toBeUndefined();
    expect(css.declarations.some((d) => d.prop === "outline" && /#/.test(d.value))).toBe(false);
  });

  it("sizes the header at 40px with 48px side padding and a #2E4A8F rule", () => {
    expect(rule(".header", "min-height")).toBe("40px");
    expect(rule(".header", "padding")).toBe("0 48px");
    expect(rule(".header", "border-bottom")).toBe("1px solid #2E4A8F");
    expect(rule(".header", "display")).toBe("flex");
    expect(rule(".header", "flex-wrap")).toBe("wrap");
    expect(rule(".header", "justify-content")).toBe("space-between");
    expect(rule(".header", "flex")).toBe("none");
    expect(rule(".header", "background")).toBeUndefined();
    expect(rule(".title", "font-weight")).toBe("700");
  });

  it("lays the Legend out with a 20px gap and keeps each item on one line", () => {
    expect(rule(".legend", "display")).toBe("flex");
    expect(rule(".legend", "flex-wrap")).toBe("wrap");
    expect(rule(".legend", "gap")).toBe("0 20px");
    expect(rule(".legend", "color")).toBe("#BAC4E2");
    expect(rule(".legend", "font-size")).toBe("12px");
    expect(rule(".legendItem", "white-space")).toBe("nowrap");
  });

  it("pads the body 18px 48px and sets 13.5px / 20px in the Pane font", () => {
    expect(rule(".body", "padding")).toBe("18px 48px");
    expect(rule(".pane", "font-size")).toBe("13.5px");
    expect(rule(".pane", "line-height")).toBe("20px");
    expect(rule(".pane", "font-family")).toBe("var(--font-pane)");
    expect(rule(".pane", "background")).toBe("#0F2766");
    expect(rule(".pane", "color")).toBe("#E8ECF6");
    expect(rule(".line", "min-height")).toBe("20px");
    expect(rule(".line", "content-visibility")).toBe("auto");
  });

  it("draws the cursor #0F2766 on #E8ECF6", () => {
    expect(rule(".cursor", "color")).toBe("#0F2766");
    expect(rule(".cursor", "background")).toBe("#E8ECF6");
  });

  it("measures contrast: white on --fail is at least 7, pane text on the pane is at least 4.5", () => {
    expect(contrast("#FFFFFF", "#A8001C")).toBeGreaterThanOrEqual(7);
    expect(contrast("#FFFFFF", "#A8001C").toFixed(2)).toBe("7.83");
    expect(contrast(rule(".hum", "color"), rule(".pane", "background")).toFixed(2)).toBe("11.82");
    expect(contrast(rule(".pending", "color"), rule(".pane", "background")).toFixed(2)).toBe(
      "8.04",
    );
  });

  it("computes the WCAG ratio: black on white is 21 and a colour on itself is 1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#0F2766", "#0F2766")).toBeCloseTo(1, 5);
  });
});
