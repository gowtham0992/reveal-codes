import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockingIssues, issues } from "../src/issues";
import { arbDocument } from "../src/testing/arbitraries";
import type { Document, Issue } from "../src/types";
import { runs } from "./support/fc";

/** Test-local rendered opening codes (Glossary), typed independently of src. */
const CITATION_CODE = {
  not_found: "CIT ✘",
  ambiguous: "CIT ?",
  unchecked: "CIT …",
} as const;

/**
 * Independent model of the Issue set: walk every record once and keep the
 * non-passing items (Req 12.5, 13.4, 17.6, 17.7, 18.2). Order is not part
 * of Property 32, so the model is compared sorted by key.
 */
function modelIssues(d: Document): readonly Issue[] {
  const out: Issue[] = [];
  for (const r of d.citations) {
    const { start, end, value } = r.citation;
    if (r.kind === "full" && r.result.status !== "verified") {
      out.push({ key: r.key, kind: "citation", start, end, code: CITATION_CODE[r.result.status] });
    } else if (r.kind === "short" && value.kind === "short" && value.targetStart === null) {
      out.push({ key: r.key, kind: "orphan", start, end, code: "CIT …" });
    }
  }
  for (const q of d.quotes) {
    if (q.result.status === "match") continue;
    const code = q.result.status === "mismatch" ? "QUO ✘" : "QUO …";
    out.push({ key: q.key, kind: "quote", start: q.quote.start, end: q.quote.end, code });
  }
  return out;
}

const byKey = (a: Issue, b: Issue): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

describe("issues properties: the Issue set _Requirements: 12.5, 13.4, 17.6, 17.7, 18.2_", () => {
  it("Property 32: the Issue set is exactly the non-passing items", () => {
    // Property 32
    fc.assert(
      fc.property(arbDocument, (d) => {
        const actual = issues(d);
        const expected = modelIssues(d);

        expect([...actual].sort(byKey)).toEqual([...expected].sort(byKey));
        expect(new Set(actual.map((i) => i.key)).size).toBe(actual.length);

        // No linked Short_Form and no Other_Reference is ever an Issue.
        const linkedOrOther = new Set<string>();
        for (const r of d.citations) {
          if (r.kind === "short" && r.citation.value.kind === "short") {
            if (r.citation.value.targetStart !== null) linkedOrOther.add(r.key);
          }
        }
        for (const i of actual) expect(linkedOrOther.has(i.key)).toBe(false);
        expect(actual.length).toBeLessThanOrEqual(d.citations.length + d.quotes.length);
      }),
      runs(),
    );
  });
});

describe("issues properties: blocking Issues _Requirements: 18.1, 18.8_", () => {
  it("Property 33: blockingIssues are the un-overridden Issues in order", () => {
    // Property 33
    fc.assert(
      fc.property(arbDocument, (d) => {
        const all = issues(d);
        const overriddenKeys = new Set(d.overrides.map((o) => o.key));
        const expected = all.filter((i) => !overriddenKeys.has(i.key));
        const actual = blockingIssues(d);

        // Same Issues, same order as issues(d) minus the overridden keys.
        expect(actual).toEqual(expected);
        // Each key appears once.
        expect(new Set(actual.map((i) => i.key)).size).toBe(actual.length);
        // Empty exactly when every Issue has an Override.
        expect(actual.length === 0).toBe(all.every((i) => overriddenKeys.has(i.key)));
      }),
      runs(),
    );
  });
});
