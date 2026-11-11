import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

describe("Status bar stylesheet _Requirements: 7.13, 7.14, 7.15, 13.10_", () => {
  const css = parseCss(readFileSync(join(WEB_ROOT, "src/pane/status-bar.module.css"), "utf8"));
  // Prettier lowercases hex digits; compare case-insensitively.
  const rule = (selector: string, prop: string): string | undefined =>
    css.declarations
      .find((d) => d.selector === selector && d.prop === prop)
      ?.value.replace(/#[0-9a-f]{6}/gi, (h) => h.toUpperCase());

  it("is 26px high, #0A1C4F with #C9D2EC text", () => {
    expect(rule(".bar", "height")).toBe("26px");
    expect(rule(".bar", "background")).toBe("#0A1C4F");
    expect(rule(".bar", "color")).toBe("#C9D2EC");
  });
  it("sets 12px IBM Plex Mono through the pane font variable", () => {
    expect(rule(".bar", "font-size")).toBe("12px");
    expect(rule(".bar", "font-family")).toBe("var(--font-pane)");
    const tokens = readFileSync(join(WEB_ROOT, "app/globals.css"), "utf8");
    expect(tokens).toMatch(/--font-pane:\s*"IBM Plex Mono"/);
  });
  it("draws key names white at weight 700", () => {
    expect(rule(".key", "color")).toBe("var(--white)");
    expect(rule(".key", "font-weight")).toBe("700");
  });
  it("keeps colour, font and height out of the layout-only status-line stylesheet", () => {
    const layout = parseCss(
      readFileSync(join(WEB_ROOT, "src/components/status-line.module.css"), "utf8"),
    );
    const props = layout.declarations.map((d) => d.prop);
    for (const banned of ["color", "background", "font-family", "font-size", "height"]) {
      expect(props).not.toContain(banned);
    }
  });
});
