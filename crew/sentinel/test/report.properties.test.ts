import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { renderJson, renderReport } from "../src/report.js";
import type { SweepReport } from "../src/types.js";
import { arbSweepReport } from "./support/arbitraries.js";
import { runs } from "./support/fc.js";

function deepCopy(report: SweepReport): SweepReport {
  return {
    sweptAt: new Date(report.sweptAt.getTime()),
    mode: report.mode,
    files: report.files.map((f) => ({ file: f.file, findings: f.findings.map((x) => ({ ...x })) })),
  };
}

const collate = (a: string, b: string): number => a.localeCompare(b, "en");

/** Lines of the section that starts at `## <file>` and ends before the next `## ` heading. */
function sectionOf(lines: readonly string[], file: string): readonly string[] {
  const start = lines.indexOf(`## ${file}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

const arbCase = arbSweepReport.chain((report) =>
  fc.shuffledSubarray([...report.files], { minLength: report.files.length }).map((files) => ({
    report,
    shuffled: { ...report, files } as SweepReport,
  })),
);

describe("sweep report _Requirements: 9.1, 9.2, 9.7, 9.8, 9.10_", () => {
  // Property 2
  it("P2 renderReport and renderJson are functions of their inputs", () => {
    fc.assert(
      fc.property(arbCase, ({ report, shuffled }) => {
        const copy = deepCopy(report);
        const md = renderReport(report);
        const json = renderJson(report);
        expect(renderReport(copy)).toBe(md);
        expect(renderJson(copy)).toBe(json);
        expect(renderReport(shuffled)).toBe(md);
        expect(renderJson(shuffled)).toBe(json);

        const expected = report.files.map((f) => f.file).sort(collate);
        const lines = md.split("\n");
        const headings = lines.filter((l) => l.startsWith("## ")).map((l) => l.slice(3));
        expect(headings).toEqual(expected);
        const parsed = JSON.parse(json) as { sweptAt: string; files: { file: string }[] };
        expect(parsed.files.map((f) => f.file)).toEqual(expected);
        expect(parsed.sweptAt).toBe(report.sweptAt.toISOString());

        for (const f of report.files) {
          expect(sectionOf(lines, f.file).includes("No drift.")).toBe(f.findings.length === 0);
        }
        expect(md.endsWith("\n")).toBe(true);
        expect(md.endsWith("\n\n")).toBe(false);
      }),
      { numRuns: runs(process.env) },
    );
  });
});
