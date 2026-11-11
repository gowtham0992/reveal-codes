import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

describe("Assistant stylesheets _Requirements: 9.1, 9.2, 9.3, 13.10_", () => {
  const text = (path: string) => readFileSync(join(WEB_ROOT, path), "utf8");
  const column = parseCss(text("src/components/assistant-column.module.css"));
  const panel = parseCss(text("src/components/assistant-panel.module.css"));
  const value = (css: typeof column, selector: string, prop: string): string | undefined =>
    css.declarations.find((d) => d.selector === selector && d.prop === prop)?.value;

  it("draws the column on the panel colour with a 1px rule on the right", () => {
    expect(value(column, ".column", "background")).toBe("var(--panel)");
    expect(value(column, ".column", "border-right")).toBe("1px solid var(--rule)");
  });

  it("leaves the closed strip without a right edge", () => {
    expect(value(column, ".column.closed", "border-right")).toBe("0");
  });

  it("draws the panel on the panel colour", () => {
    expect(value(panel, ".panel", "background")).toBe("var(--panel)");
  });

  it("sets the heading in regular Libre Caslon 20px/26px over a 1px rule", () => {
    expect(value(panel, ".heading", "font-family")).toBe("var(--font-editor)");
    expect(value(panel, ".heading", "font-size")).toBe("20px");
    expect(value(panel, ".heading", "line-height")).toBe("26px");
    expect(value(panel, ".heading", "font-weight")).toBe("400");
    expect(value(panel, ".heading", "border-bottom")).toBe("1px solid var(--rule)");
  });

  it("colours the label muted and sets the reply in 13px/19px Libre Caslon", () => {
    expect(value(panel, ".label", "color")).toBe("var(--muted)");
    expect(value(panel, ".stream", "font-family")).toBe("var(--font-editor)");
    expect(value(panel, ".stream", "font-size")).toBe("13px");
    expect(value(panel, ".stream", "line-height")).toBe("19px");
  });

  it("keeps only layout on the prompt and uses no removed alias", () => {
    const props = panel.declarations.filter((d) => d.selector === ".prompt").map((d) => d.prop);
    expect(props).toEqual(["width"]);
    for (const path of [
      "src/components/assistant-column.module.css",
      "src/components/assistant-panel.module.css",
    ]) {
      expect(text(path)).not.toMatch(/--ui-bg|--accent|--size-/);
    }
  });
});
