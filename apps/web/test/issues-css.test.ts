import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

describe("Issues region stylesheets _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12_", () => {
  const read = (path: string) => parseCss(readFileSync(join(WEB_ROOT, path), "utf8"));
  const pick = (path: string) => {
    const css = read(path);
    return (selector: string, prop: string): string | undefined =>
      css.declarations.find((d) => d.selector === selector && d.prop === prop)?.value;
  };
  const region = pick("src/components/issues-region.module.css");
  const list = pick("src/components/issues-list.module.css");
  const result = pick("src/components/verify-result.module.css");

  it("draws the region on the panel with a rule on the left and a Caslon heading", () => {
    expect(region(".issues", "background")).toBe("var(--panel)");
    expect(region(".issues", "border-left")).toBe("1px solid var(--rule)");
    expect(region(".issues", "grid-row")).toBe("2 / 4");
    expect(region(".heading", "font-family")).toBe("var(--font-editor)");
    expect(region(".heading", "font-size")).toBe("20px");
    expect(region(".heading", "line-height")).toBe("26px");
    expect(region(".heading", "font-weight")).toBe("400");
    expect(region(".heading", "border-bottom")).toBe("1px solid var(--rule)");
    expect(region(".note", "color")).toBe("var(--muted)");
  });
  it("sets the verify result line muted at 12.5px/18px", () => {
    expect(result(".line", "color")).toBe("var(--muted)");
    expect(result(".line", "font-size")).toBe("12.5px");
    expect(result(".line", "line-height")).toBe("18px");
  });
  it("sets the list rule, the 24px control height and the row box", () => {
    expect(list(".list", "border-top")).toBe("3px double var(--ink)");
    expect(list(".list", "--control-h")).toBe("24px");
    expect(list(".row", "padding")).toBe("10px 0");
    expect(list(".row", "border-bottom")).toBe("1px solid var(--rule-light)");
    expect(list(".lineA", "justify-content")).toBe("space-between");
    expect(list(".lineEnd", "justify-content")).toBe("flex-end");
    expect(list(".actions", "gap")).toBe("8px");
  });
  it("gives both chips the same box and the failing chip the fail fill", () => {
    for (const prop of ["padding", "font-size", "line-height", "font-weight", "font-family"]) {
      expect(list(".chipFail", prop)).toBe(list(".chip", prop));
    }
    expect(list(".chip", "border")).toBe("1px solid var(--ink)");
    expect(list(".chipFail", "border")).toBe("1px solid var(--fail)");
    expect(list(".chipFail", "background")).toBe("var(--fail)");
    expect(list(".chipFail", "color")).toBe("var(--white)");
  });
  it("sets the words in oxblood and the text in the editor face", () => {
    expect(list(".words", "color")).toBe("var(--oxblood)");
    expect(list(".text", "font-family")).toBe("var(--font-editor)");
    expect(list(".text", "font-size")).toBe("13px");
    expect(list(".text", "line-height")).toBe("19px");
  });
});
