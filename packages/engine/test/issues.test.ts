import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document";
import { blockingIssues, issues, overrides, recordOverride } from "../src/issues";
import type { Result } from "../src/result";
import type { Document } from "../src/types";
import { setQuoteCheck, setVerification } from "../src/verification";

const TS = "2026-11-03T10:00:00Z";
const TS2 = "2026-11-04T10:00:00Z";
const TEXT = 'Roe v. Wade, 410 U.S. 113 (1973), held "the right of privacy is broad." Id. at 153.';

function unwrap<T>(r: Result<T, unknown>): T {
  if (!r.ok) throw new Error(`unexpected error: ${JSON.stringify(r.error)}`);
  return r.value;
}

const doc = (text: string): Document => unwrap(createDocument(text, TS));

function fullKey(d: Document): string {
  for (const r of d.citations) if (r.kind === "full") return r.key;
  throw new Error("no full citation");
}

function quoteKey(d: Document): string {
  const q = d.quotes[0];
  if (q === undefined) throw new Error("no quote");
  return q.key;
}

describe("issues", () => {
  it("lists unchecked citation and quote, citation first, with codes (Req 18.1, 18.2)", () => {
    const d = doc(TEXT);
    const list = issues(d);
    expect(list.map((i) => [i.kind, i.code])).toEqual([
      ["citation", "CIT …"],
      ["quote", "QUO …"],
    ]);
    expect(list[0]?.start).toBeLessThan(list[1]?.start ?? -1);
    expect(blockingIssues(d)).toEqual(list);
  });

  it("maps statuses to codes and drops verified, linked, and matching items", () => {
    let d = doc(TEXT);
    const c = fullKey(d);
    const q = quoteKey(d);
    d = unwrap(setVerification(d, c, { status: "not_found" }));
    d = unwrap(setQuoteCheck(d, q, { status: "mismatch", prefixLength: 3 }));
    expect(issues(d).map((i) => i.code)).toEqual(["CIT ✘", "QUO ✘"]);
    d = unwrap(setVerification(d, c, { status: "ambiguous", candidates: ["1", "2"] }));
    expect(issues(d).map((i) => i.code)).toEqual(["CIT ?", "QUO ✘"]);
    d = unwrap(setVerification(d, c, { status: "verified", clusterId: "9" }));
    d = unwrap(setQuoteCheck(d, q, { status: "match" }));
    expect(issues(d)).toEqual([]);
    expect(blockingIssues(d)).toEqual([]);
  });

  it("reports an Orphan as an Issue (Req 12.5)", () => {
    const d = doc("Id. at 9.");
    expect(issues(d).map((i) => [i.kind, i.code])).toEqual([["orphan", "CIT …"]]);
  });

  it("excludes Other_References", () => {
    expect(issues(doc("See 42 U.S.C. § 1983."))).toEqual([]);
  });
});

describe("recordOverride", () => {
  it("stores the reason verbatim and unblocks the issue (Req 18.3)", () => {
    const d = doc(TEXT);
    const c = fullKey(d);
    const next = unwrap(recordOverride(d, c, "  pending lookup  ", TS2));
    expect(overrides(next)).toEqual([{ key: c, reason: "  pending lookup  ", timestamp: TS2 }]);
    expect(blockingIssues(next).map((i) => i.kind)).toEqual(["quote"]);
  });

  it("keeps one Override per key, replacing the old one (Req 18.4)", () => {
    const d = doc(TEXT);
    const c = fullKey(d);
    const once = unwrap(recordOverride(d, c, "first", TS));
    const twice = unwrap(recordOverride(once, c, "second", TS2));
    expect(overrides(twice)).toEqual([{ key: c, reason: "second", timestamp: TS2 }]);
  });

  it("orders Overrides in issue order regardless of recording order (Req 18.7)", () => {
    const d = doc(TEXT);
    const c = fullKey(d);
    const q = quoteKey(d);
    const a = unwrap(recordOverride(d, q, "q", TS));
    const b = unwrap(recordOverride(a, c, "c", TS));
    expect(overrides(b).map((o) => o.key)).toEqual([c, q]);
    expect(blockingIssues(b)).toEqual([]);
  });

  it("rejects an empty or whitespace-only reason (Req 18.5)", () => {
    const d = doc(TEXT);
    const key = fullKey(d);
    for (const reason of ["", " \t\n", "\u00a0\ufeff"]) {
      expect(recordOverride(d, key, reason, TS)).toEqual({
        ok: false,
        error: { kind: "empty_override_reason", key },
      });
    }
  });

  it("rejects keys that are not current Issues (Req 18.6)", () => {
    const d = doc(TEXT);
    const c = fullKey(d);
    const verified = unwrap(setVerification(d, c, { status: "verified", clusterId: "9" }));
    expect(recordOverride(verified, c, "why", TS)).toEqual({
      ok: false,
      error: { kind: "unknown_issue", key: c },
    });
    expect(recordOverride(d, "k999", "why", TS)).toEqual({
      ok: false,
      error: { kind: "unknown_issue", key: "k999" },
    });
  });

  it("checks unknown_issue, then empty reason, then timestamp", () => {
    const d = doc(TEXT);
    const key = fullKey(d);
    expect(recordOverride(d, "k999", "", "bad")).toMatchObject({
      error: { kind: "unknown_issue" },
    });
    expect(recordOverride(d, key, "", "bad")).toMatchObject({
      error: { kind: "empty_override_reason" },
    });
    expect(recordOverride(d, key, "why", "bad")).toEqual({
      ok: false,
      error: { kind: "invalid_timestamp", value: "bad" },
    });
  });
});
