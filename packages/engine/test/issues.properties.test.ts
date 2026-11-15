import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockingIssues, issues, recordOverride } from "../src/issues";
import {
  applyStateStep,
  arbBadTimestamp,
  arbBlankReason,
  arbDocument,
  arbReason,
  arbStateOpSequence,
  arbTimestamp,
} from "../src/testing/arbitraries";
import type { Document, Issue } from "../src/types";
import { runs } from "./support/fc";

/** Test-local rendered opening codes (Glossary), typed independently of src. */
const CITATION_CODE = {
  not_found: "CIT ✘",
  wrong_case: "CIT ≠",
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

const arbPick = fc.nat({ max: 1000 });

/** Keys of the Document that are not Issues, plus one key no record holds. */
function nonIssueKeys(d: Document): readonly string[] {
  const issueKeys = new Set(issues(d).map((i) => i.key));
  const held = [
    ...d.citations.flatMap((r) => (r.kind === "other" ? [] : [r.key])),
    ...d.quotes.map((q) => q.key),
  ];
  return [...held.filter((k) => !issueKeys.has(k)), "k999999", "absent"];
}

describe("issues properties: recording an Override _Requirements: 18.3, 18.4, 18.5, 18.6, 18.7_", () => {
  it("Property 34: Recording an Override follows the reason and target rules", () => {
    // Property 34
    fc.assert(
      fc.property(
        arbDocument,
        arbPick,
        arbPick,
        arbReason,
        arbBlankReason,
        arbTimestamp,
        arbBadTimestamp,
        (d, pickIssue, pickOther, reason, blank, ts, badTs) => {
          const before = structuredClone(d);
          const all = issues(d);
          const others = nonIssueKeys(d);
          const unknownKey = others[pickOther % others.length] ?? "absent";

          // A non-Issue key is unknown_issue first, whatever the reason and Timestamp.
          for (const [r, t] of [
            [reason, ts],
            [blank, ts],
            [reason, badTs],
            [blank, badTs],
          ] as const) {
            const res = recordOverride(d, unknownKey, r, t);
            expect(res).toEqual({ ok: false, error: { kind: "unknown_issue", key: unknownKey } });
          }

          const target = all[pickIssue % Math.max(all.length, 1)];
          if (target === undefined) {
            expect(d).toEqual(before);
            return;
          }
          const key = target.key;

          // A blank reason is empty_override_reason before the Timestamp is checked.
          expect(recordOverride(d, key, blank, ts)).toEqual({
            ok: false,
            error: { kind: "empty_override_reason", key },
          });
          expect(recordOverride(d, key, blank, badTs)).toEqual({
            ok: false,
            error: { kind: "empty_override_reason", key },
          });

          // A good reason with a bad Timestamp is invalid_timestamp.
          expect(recordOverride(d, key, reason, badTs)).toEqual({
            ok: false,
            error: { kind: "invalid_timestamp", value: badTs },
          });

          // Rejected writes leave the Document unchanged.
          expect(d).toEqual(before);

          // A good reason and Timestamp succeed.
          const res = recordOverride(d, key, reason, ts);
          expect(res.ok).toBe(true);
          expect(d).toEqual(before);
          if (!res.ok) return;
          const next = res.value;
          expect(blockingIssues(next).some((i) => i.key === key)).toBe(false);
          expect(next.overrides.find((o) => o.key === key)).toEqual({ key, reason, timestamp: ts });

          // One Override per key, in issue order, and the other Overrides are kept.
          const keys = next.overrides.map((o) => o.key);
          expect(new Set(keys).size).toBe(keys.length);
          const rank = new Map(all.map((i, n) => [i.key, n]));
          const ranks = keys.map((k) => rank.get(k) ?? -1);
          expect(ranks.every((n) => n >= 0)).toBe(true);
          expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
          for (const o of d.overrides) {
            if (o.key !== key) expect(next.overrides).toContainEqual(o);
          }

          // Recording again replaces: still one Override for the key.
          const again = recordOverride(next, key, `${reason}!`, ts);
          expect(again.ok).toBe(true);
          if (again.ok) {
            expect(again.value.overrides.filter((o) => o.key === key)).toEqual([
              { key, reason: `${reason}!`, timestamp: ts },
            ]);
          }
        },
      ),
      runs(),
    );
  });
});

/** Asserts the Property 35 invariants on one Document. */
function expectOverridesAndUnlisted(d: Document): void {
  const all = issues(d);
  const rank = new Map(all.map((i, n) => [i.key, n]));
  const keys = d.overrides.map((o) => o.key);
  // Each Override key is a current Issue key, once, in issue order.
  expect(new Set(keys).size).toBe(keys.length);
  const ranks = keys.map((k) => rank.get(k) ?? -1);
  expect(ranks.every((n) => n >= 0)).toBe(true);
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  // An unlisted LEXIS citation is never verified.
  for (const r of d.citations) {
    if (
      r.kind === "full" &&
      r.citation.value.kind === "database" &&
      r.citation.value.lexisCourtListed === false
    ) {
      expect(r.result.status).not.toBe("verified");
    }
  }
}

describe("issues properties: Overrides and unlisted LEXIS _Requirements: 15.8, 16.5, 16.6, 17.4_", () => {
  it("Property 35: Overrides only ever belong to current Issues", () => {
    // Property 35
    fc.assert(
      fc.property(
        arbDocument.chain((d) => fc.tuple(fc.constant(d), arbStateOpSequence(d))),
        ([d, steps]) => {
          let cur = d;
          expectOverridesAndUnlisted(cur);
          for (const step of steps) {
            const r = applyStateStep(cur, step);
            // A rejected step leaves the Document as it was.
            if (r.ok) cur = r.value;
            expectOverridesAndUnlisted(cur);
          }
        },
      ),
      runs(),
    );
  });
});
