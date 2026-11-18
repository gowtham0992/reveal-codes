import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { issues, render } from "@reveal-codes/engine";
import type { Document, IssueCode, IssueKey } from "@reveal-codes/engine";
import { courtListenerLink } from "@reveal-codes/verifier/link";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import { arbCheckedDocument } from "../../../packages/engine/src/testing/arbitraries";
import { NEXT_SENTENCES, STATUS_WORDS, checkRows, shorten } from "../src/client/check-rows";
import type { CheckRow, RowCode } from "../src/client/check-rows";
import { divergenceSentence } from "../src/client/divergence";
import { mismatchLines, mismatchOf } from "../src/client/mismatch";
import { resolvedRows } from "../src/client/resolved";
import { issueWords } from "../src/components/issues-list";
import { runs } from "./support/fc";

const FAILING: readonly string[] = ["CIT ✘", "CIT ≠", "CIT ?", "CIT …", "QUO ✘", "QUO …"];

/** The code a citation or quote result must show, derived from the record alone. */
function expectedCode(doc: Document, key: IssueKey): RowCode | null {
  for (const c of doc.citations) {
    if (c.kind !== "full" || c.key !== key) continue;
    const table = {
      verified: "CIT ✓",
      not_found: "CIT ✘",
      wrong_case: "CIT ≠",
      ambiguous: "CIT ?",
      unchecked: "CIT …",
    } as const;
    return table[c.result.status];
  }
  for (const q of doc.quotes) {
    if (q.key !== key) continue;
    const table = { match: "QUO ✓", mismatch: "QUO ✘", unchecked: "QUO …" } as const;
    return table[q.result.status];
  }
  return null;
}

function checkShape(doc: Document, rows: readonly CheckRow[]): void {
  const failing = issues(doc);
  const orphanKeys = failing.filter((i) => i.kind === "orphan").map((i) => i.key);
  const wantKeys = [
    ...doc.citations.flatMap((c) => (c.kind === "full" ? [c.key] : [])),
    ...doc.quotes.map((q) => q.key),
    ...orphanKeys,
  ];
  // Each item once, none for a linked short form.
  expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  expect([...rows.map((r) => r.key)].sort()).toEqual([...wantKeys].sort());
  // Document order: increasing (start, citation before quote).
  const rank = (r: CheckRow): number => (r.kind === "quote" ? 1 : 0);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1] as CheckRow;
    const b = rows[i] as CheckRow;
    expect(a.start - b.start || rank(a) - rank(b)).toBeLessThanOrEqual(0);
    expect(a.start < b.start || rank(a) < rank(b)).toBe(true);
  }
  // Failing rows are the Issues, in order.
  const span = (r: { key: string; kind: string; start: number; end: number; code: string }) => ({
    key: r.key,
    kind: r.kind,
    start: r.start,
    end: r.end,
    code: r.code,
  });
  expect(rows.filter((r) => FAILING.includes(r.code)).map(span)).toEqual(failing.map(span));
}

function checkCodes(doc: Document, rows: readonly CheckRow[]): void {
  const tokens = render(doc, "display").positions.map((p) => p.code);
  const issueByKey = new Map(issues(doc).map((i) => [i.key, i]));
  for (const row of rows) {
    const issue = issueByKey.get(row.key);
    if (row.kind !== "orphan") expect(row.code).toBe(expectedCode(doc, row.key));
    expect(row.text).toBe(doc.text.slice(row.start, row.end));
    expect(row.words).toBe(STATUS_WORDS[row.code]);
    expect(tokens.some((t) => t.startsWith(`[${row.code}`))).toBe(true);
    if (issue !== undefined) {
      expect(issueWords(issue.code, true)).toBe(`blocking, ${row.words}`);
      expect(issueWords(issue.code, false)).toBe(`overridden, ${row.words}`);
    } else {
      expect(row.words).toBe(row.code === "CIT ✓" ? "found" : "match");
    }
    expect(shorten(row.text).length).toBeLessThanOrEqual(row.text.length);
  }
}

function checkPayload(
  doc: Document,
  info: ReadonlyMap<IssueKey, DisplayInfo>,
  rows: readonly CheckRow[],
): void {
  const resolved = new Map((resolvedRows(doc, { epoch: 0, info }, 0) ?? []).map((r) => [r.key, r]));
  for (const row of rows) {
    const verified = resolved.get(row.key);
    if (row.code === "CIT ✓") {
      expect(verified).toBeDefined();
      expect(row.found).toBe(verified?.found);
      expect(row.href).toBe(verified?.href);
    } else {
      expect(verified).toBeUndefined();
      expect(row.found).toBeNull();
    }
    if (row.code === "CIT ≠") {
      const m = mismatchOf(doc, row.key);
      expect(m).not.toBeNull();
      if (m === null) continue;
      const shown = info.get(row.key);
      const url = shown?.clusterId === m.clusterId ? shown.absoluteUrl : undefined;
      expect(row.mismatch).toEqual(mismatchLines(m));
      expect(row.href).toBe(courtListenerLink(m.clusterId, url));
    } else {
      expect(row.mismatch).toEqual([]);
    }
    if (row.code === "QUO ✘") {
      const q = doc.quotes.find((x) => x.key === row.key);
      const sentence =
        q?.result.status === "mismatch"
          ? divergenceSentence(doc.text.slice(row.start, row.end), q.result.prefixLength)
          : "";
      expect(row.divergence).toBe(sentence === "" ? null : sentence);
    } else {
      expect(row.divergence).toBeNull();
    }
    if (row.kind === "quote") expect(row.href).toBeNull();
  }
}

function checkNext(rows: readonly CheckRow[]): void {
  for (const row of rows) {
    if (FAILING.includes(row.code)) {
      const sentence = NEXT_SENTENCES[row.code as IssueCode];
      expect(row.next).toBe(sentence);
      expect(sentence).not.toMatch(/!|fake|fabricated|does not exist/i);
    } else {
      expect(row.next).toBeNull();
    }
  }
}

/** Clauses 7 and 8: the Case_Name_Option adds the cited name and changes nothing else. */
function checkCaseNames(
  doc: Document,
  caseNames: boolean,
  withOption: readonly CheckRow[],
  without: readonly CheckRow[],
): void {
  if (!caseNames) {
    expect(withOption).toEqual(without);
    for (const row of withOption) expect("caseName" in row).toBe(false);
    return;
  }
  expect(withOption.length).toBe(without.length);
  withOption.forEach((row, i) => {
    const base = without[i] as CheckRow;
    const rec = doc.citations.find((c) => c.kind === "full" && c.key === row.key);
    const expected =
      row.kind === "citation" && rec?.kind === "full" ? rec.citation.caseName : undefined;
    if (expected === undefined) expect("caseName" in row).toBe(false);
    else expect(row.caseName).toBe(expected);
    const rest = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "caseName"));
    expect(rest).toEqual(base);
  });
}

describe("check-rows properties _Requirements: 8.1, 8.2, 19.13, 27.16_", () => {
  // Property 1
  it("P1 one answer: rows agree with the Issues region and the Resolved list", () => {
    fc.assert(
      fc.property(arbCheckedDocument, fc.boolean(), ({ document, info }, caseNames) => {
        const without = checkRows(document, info);
        const withOption = checkRows(document, info, { caseNames });
        for (const rows of [without, withOption]) {
          checkShape(document, rows);
          checkCodes(document, rows);
          checkPayload(document, info, rows);
          checkNext(rows);
        }
        checkCaseNames(document, caseNames, withOption, without);
      }),
      { numRuns: runs() },
    );
  });
});
