import * as fc from "fast-check";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildStatement, renderStatement } from "../src/index.js";
import type { StatementBlock } from "../src/index.js";
import { arbExportCase, runs } from "./support/arbitraries.js";
import type { ExportCase } from "./support/arbitraries.js";
import { declarationFor } from "./support/declarations.js";

type Status = "verified" | "wrong_case" | "not_found" | "ambiguous" | "unchecked";

type Expected = Readonly<{
  counts: Readonly<Record<Status, number>>;
  rows: readonly (readonly [string, string, string])[];
}>;

/** Counts and table rows computed from the Document alone, independently of the package. */
function expectedOf(doc: Document): Expected {
  const counts: Record<Status, number> = {
    verified: 0,
    wrong_case: 0,
    not_found: 0,
    ambiguous: 0,
    unchecked: 0,
  };
  const rows: [string, string, string][] = [];
  for (const r of doc.citations) {
    if (r.kind !== "full") continue;
    const res = r.result;
    counts[res.status] += 1;
    const text = r.citation.text;
    if (res.status === "verified") rows.push([text, "CIT ✓", res.clusterId]);
    else if (res.status === "wrong_case") {
      const year = res.foundYear === undefined ? "" : `, ${String(res.foundYear)}`;
      rows.push([text, `CIT ≠ (${res.foundName}${year})`, res.clusterId]);
    } else if (res.status === "not_found") rows.push([text, "CIT ✘", ""]);
    else if (res.status === "ambiguous") rows.push([text, "CIT ?", ""]);
    else rows.push([text, "CIT …", ""]);
  }
  return { counts, rows };
}

function paragraphs(blocks: readonly StatementBlock[]): readonly string[] {
  return blocks.flatMap((b) => (b.kind === "paragraph" ? [b.text] : []));
}

function check(c: ExportCase): number {
  const built = buildStatement(
    c.document,
    c.runLog,
    c.meta,
    null,
    declarationFor(c.document, null),
  );
  expect(built.ok).toBe(true);
  if (!built.ok) return 0;
  const blocks = renderStatement(built.value);
  const { counts, rows } = expectedOf(c.document);
  const total = rows.length;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  expect(sum).toBe(total);
  const paras = paragraphs(blocks).filter((p) => p.startsWith("Every legal citation"));
  if (total === 0) {
    expect(paras).toHaveLength(0);
    expect(paragraphs(blocks)).toContain("This filing contains no legal citations.");
    return 0;
  }
  const when =
    built.value.verifiedAt === null ? "a date that was not recorded" : built.value.verifiedDate;
  const sentence =
    `Every legal citation in this filing was checked against the CourtListener database on ${String(when)}. ` +
    `${String(counts.verified)} resolved to a single reported decision, ` +
    `${String(counts.wrong_case)} resolved to a different case than the one named, ` +
    `${String(counts.not_found)} could not be found, ` +
    `${String(counts.ambiguous)} matched more than one decision, and ${String(counts.unchecked)} were not checked.`;
  expect(paras).toEqual([sentence]);
  const table = blocks.find((b) => b.kind === "table" && b.columns[0] === "Citation");
  expect(table?.kind === "table" ? table.rows : undefined).toEqual(rows);
  return counts.wrong_case;
}

/**
 * A Document with a wrong_case citation drew about 6% of random runs, so at
 * 200 runs alone the guard below missed about 1 run in 130,000. This fixed
 * example (seed 1) makes it hold on every run. fast-check counts examples
 * inside `numRuns`, so the count is raised by their number.
 */
const WRONG_CASE_EXAMPLES: [ExportCase][] = fc
  .sample(arbExportCase, { numRuns: 400, seed: 1 })
  .filter((c) => expectedOf(c.document).counts.wrong_case > 0)
  .slice(0, 1)
  .map((c): [ExportCase] => [c]);

describe("statement citation counts _Requirements: 8.1, 8.2, 8.3, 8.4_", () => {
  // Property 14
  it("P14 the five counts sum to the Full_Citations, wrong_case has its own term and Status cell", () => {
    let wrongCaseSeen = 0;
    fc.assert(
      fc.property(arbExportCase, (c) => {
        wrongCaseSeen += check(c);
      }),
      { numRuns: runs() + WRONG_CASE_EXAMPLES.length, examples: WRONG_CASE_EXAMPLES },
    );
    expect(wrongCaseSeen).toBeGreaterThan(0);
  }, 120_000);
});
