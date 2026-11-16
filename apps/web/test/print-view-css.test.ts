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

  it("gives the Code and Timestamp columns their minimum widths", () => {
    expect(value(".overrides th:nth-child(1), .overrides td:nth-child(1)", "min-width")).toBe(
      "10ch",
    );
    expect(value(".overrides th:nth-child(4), .overrides td:nth-child(4)", "min-width")).toBe(
      "26ch",
    );
  });

  it("still lets body cells break anywhere", () => {
    expect(value(".table th, .table td", "overflow-wrap")).toBe("anywhere");
  });
});
