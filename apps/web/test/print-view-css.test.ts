import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

const css = parseCss(readFileSync(join(WEB_ROOT, "src/components/print-view.module.css"), "utf8"));
const value = (selector: string, prop: string): string | undefined =>
  css.declarations.find((d) => d.selector === selector && d.prop === prop)?.value;

describe("Print view override table headers _Requirements: 12.4_", () => {
  it("keeps header words whole", () => {
    expect(value(".overrides th", "overflow-wrap")).toBe("normal");
    expect(value(".overrides th", "word-break")).toBe("keep-all");
  });

  it("sizes the Code and Timestamp columns to their content _Requirements: 24.1_", () => {
    const sel =
      ".overrides th:nth-child(1), .overrides td:nth-child(1), .overrides th:nth-child(4), .overrides td:nth-child(4)";
    expect(value(sel, "white-space")).toBe("nowrap");
    expect(value(sel, "width")).toBe("1%");
  });

  it("leaves no min-width on the override columns _Requirements: 24.1, 24.3_", () => {
    const mins = css.declarations.filter(
      (d) => d.selector.includes(".overrides") && d.prop === "min-width",
    );
    expect(mins).toEqual([]);
    expect(css.declarations.some((d) => d.value === "26ch")).toBe(false);
  });

  it("wraps the Reason column by word _Requirements: 24.2_", () => {
    expect(value(".overrides td:nth-child(3)", "overflow-wrap")).toBe("break-word");
    expect(value(".overrides th", "overflow-wrap")).toBe("normal");
  });

  it("still lets body cells break anywhere", () => {
    expect(value(".table th, .table td", "overflow-wrap")).toBe("anywhere");
  });
});
