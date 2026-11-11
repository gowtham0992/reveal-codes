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

describe("Pane stylesheet _Requirements: 12.2, 12.3, 12.4_", () => {
  const css = parseCss(readFileSync(join(WEB_ROOT, "src/pane/pane.module.css"), "utf8"));
  // Prettier lowercases hex digits; compare case-insensitively.
  const rule = (selector: string, prop: string): string | undefined =>
    css.declarations
      .find((d) => d.selector === selector && d.prop === prop)
      ?.value.replace(/#[0-9a-f]{6}/gi, (h) => h.toUpperCase());

  it.each([
    ["hum", "#FFFFFF", "#0000AA"],
    ["pst", "#FFFF55", "#0000AA"],
    ["ai", "#FF55FF", "#0000AA"],
    ["aihum", "#55FFFF", "#0000AA"],
    ["verified", "#55FF55", "#0000AA"],
    ["failing", "#FFFFFF", "#AA0000"],
    ["pending", "#AA5500", "#FFFF55"],
    ["ovr", "#555555", "#AAAAAA"],
    ["ref", "#AAAAAA", "#0000AA"],
    ["close", "#FFFFFF", "#0000AA"],
  ])("%s uses %s on %s", (name, fg, bg) => {
    expect(rule(`.${name}`, "color")).toBe(fg);
    expect(rule(`.${name}`, "background")).toBe(bg);
  });

  it("draws the Pane_Header #0000AA on #AAAAAA at 12px in the Pane font _Requirements: 2.2, 2.7, 2.8_", () => {
    expect(rule(".header", "color")).toBe("#0000AA");
    expect(rule(".header", "background")).toBe("#AAAAAA");
    expect(rule(".header", "font-size")).toBe("12px");
    expect(rule(".header", "font-family")).toBe("var(--font-pane)");
    expect(rule(".header", "display")).toBe("flex");
    expect(rule(".header", "flex-wrap")).toBe("wrap");
    expect(rule(".header", "justify-content")).toBe("space-between");
    expect(rule(".header", "flex")).toBe("none");
    expect(rule(".legend", "white-space")).toBe("pre-wrap");
  });

  it("keeps each Legend item (code and label) on one line so it wraps as a unit", () => {
    expect(rule(".legendItem", "white-space")).toBe("nowrap");
  });
  it("measures the contrast of the failing and header pairs from the stylesheet _Requirements: 3.7_", () => {
    const failing = contrast(rule(".failing", "color"), rule(".failing", "background"));
    expect(failing).toBeGreaterThanOrEqual(7);
    expect(failing.toFixed(2)).toBe("7.75");
    const header = contrast(rule(".header", "color"), rule(".header", "background"));
    expect(header.toFixed(2)).toBe("5.72");
  });

  it("computes the WCAG ratio: black on white is 21 and a colour on itself is 1", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#0000AA", "#0000AA")).toBeCloseTo(1, 5);
  });

  it("sets the field, the Code_Item outline and the monospace font", () => {
    expect(rule(".pane", "background")).toBe("#0000AA");
    expect(rule(".pane", "color")).toBe("#AAAAAA");
    expect(rule(".pane", "font-family")).toBe("var(--font-pane)");
    expect(rule(".code", "outline")).toBe("1px solid #AAAAAA");
    expect(rule(".cursor", "background")).toBe("#AAAAAA");
    expect(rule(".line", "content-visibility")).toBe("auto");
  });
});
