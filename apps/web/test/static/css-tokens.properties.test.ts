import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbStrayColour, arbStylesheetSubset } from "../arbitraries";
import { formatViolations, readSources, WEB_ROOT } from "../support/scan";
import { runs } from "../support/fc";
import { scanColours, type Sheet } from "./css-colours";

const sheets: readonly Sheet[] = readSources(["app", "src"], /\.css$/);
const byPath = new Map(sheets.map((s) => [s.path, s.text]));
const isPane = (path: string): boolean => /^src\/pane\//.test(path);

/** `text` with one declaration appended on a fresh line; returns the new text and that line. */
function plant(text: string, colour: string): { text: string; line: number } {
  const base = text.endsWith("\n") ? text : `${text}\n`;
  const line = base.split("\n").length;
  return { text: `${base}.x { color: ${colour}; }\n`, line };
}

describe("css-tokens: Property 1: tokens are total _Requirements: 1.5, 1.6, 10.3, 10.4_", () => {
  it("reads the real stylesheets, including a Pane file and a non-Pane file", () => {
    expect(sheets.some((s) => isPane(s.path))).toBe(true);
    expect(sheets.some((s) => !isPane(s.path))).toBe(true);
    expect(readFileSync(join(WEB_ROOT, "app", "globals.css"), "utf8")).toBe(
      byPath.get("app/globals.css"),
    );
  });

  // Property 1
  it("reports nothing for the real sheets, and exactly the planted line for a stray colour", () => {
    const paths = sheets.map((s) => s.path);
    fc.assert(
      fc.property(arbStylesheetSubset(paths), arbStrayColour(), fc.nat(), (subset, stray, pick) => {
        const chosen = subset.map((path) => ({ path, text: byPath.get(path) ?? "" }));
        expect(formatViolations(scanColours(chosen))).toEqual([]);

        const target = chosen[pick % chosen.length] as Sheet;
        const planted = plant(target.text, stray);
        const after = chosen.map((s) =>
          s.path === target.path ? { path: s.path, text: planted.text } : s,
        );
        const found = scanColours(after);
        expect(found).toHaveLength(1);
        expect(found[0]?.file).toBe(target.path);
        expect(found[0]?.line).toBe(planted.line);
      }),
      { numRuns: runs() },
    );
  });
});
