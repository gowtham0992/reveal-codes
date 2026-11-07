import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document";
import type { Result } from "../src/result";
import type { Document, Override } from "../src/types";
import { setQuoteCheck, setVerification, verificationOf } from "../src/verification";

const TS = "2026-11-03T10:00:00Z";
const TEXT =
  'Roe v. Wade, 410 U.S. 113 (1973), held "the right of privacy is broad." Id. at 153. Orphan: Id. at 9.';
const LEXIS = "See 2023 Foo Cty. Ct. LEXIS 5.";

function unwrap<T>(r: Result<T, unknown>): T {
  if (!r.ok) throw new Error(`unexpected error: ${JSON.stringify(r.error)}`);
  return r.value;
}

const doc = (text: string): Document => unwrap(createDocument(text, TS));

function keyOf(d: Document, kind: "full" | "short", n = 0): string {
  const hits = d.citations.flatMap((r) => (r.kind === kind ? [r.key] : []));
  const key = hits[n];
  if (key === undefined) throw new Error(`no ${kind} #${String(n)}`);
  return key;
}

const withOverride = (d: Document, key: string): Document => {
  const o: Override = { key, reason: "because", timestamp: TS };
  return { ...d, overrides: [o] };
};

describe("setVerification", () => {
  it("writes the result to the citation and its Short_Form (Req 12.4, 16.1)", () => {
    const d = doc(TEXT);
    const full = keyOf(d, "full");
    const short = keyOf(d, "short");
    const r = { status: "verified", clusterId: "108713" } as const;
    const next = unwrap(setVerification(d, full, r));
    expect(verificationOf(next, full)).toEqual(r);
    expect(verificationOf(next, short)).toEqual(r);
    expect(next.text).toBe(d.text);
  });

  it("returns unchecked for an Orphan (Req 12.5)", () => {
    const d = doc("Id. at 9.");
    expect(verificationOf(d, keyOf(d, "short"))).toEqual({ status: "unchecked" });
  });

  it("checks unknown_citation before not_verifiable", () => {
    const d = doc(TEXT);
    const r = setVerification(d, "k999", { status: "unchecked" });
    expect(r).toEqual({ ok: false, error: { kind: "unknown_citation", key: "k999" } });
  });

  it("rejects a Short_Form key with not_verifiable (Req 16.5)", () => {
    const d = doc(TEXT);
    const key = keyOf(d, "short");
    const r = setVerification(d, key, { status: "unchecked" });
    expect(r).toEqual({ ok: false, error: { kind: "not_verifiable", key } });
  });

  it("rejects verified on an unlisted LEXIS court, even malformed, before payload checks", () => {
    const d = doc(LEXIS);
    const key = keyOf(d, "full");
    const bad = { status: "verified", clusterId: "" } as const;
    expect(setVerification(d, key, bad)).toEqual({
      ok: false,
      error: { kind: "not_verifiable", key },
    });
    const nf = unwrap(setVerification(d, key, { status: "not_found" }));
    expect(verificationOf(nf, key)).toEqual({ status: "not_found" });
  });

  it("rejects payloads that break Req 16.2", () => {
    const d = doc(TEXT);
    const key = keyOf(d, "full");
    const cases = [
      [{ status: "verified", clusterId: "" }, "clusterId"],
      [{ status: "ambiguous", candidates: ["a"] }, "candidates"],
      [{ status: "ambiguous", candidates: ["a", "a"] }, "candidates"],
      [{ status: "not_found", reason: "" }, "reason"],
      [{ status: "unchecked", waitUntil: "2023-02-29T00:00:00Z" }, "waitUntil"],
    ] as const;
    for (const [result, field] of cases) {
      expect(setVerification(d, key, result)).toEqual({
        ok: false,
        error: { kind: "invalid_verification_result", field },
      });
    }
  });

  it("keeps the Override on an unchanged status and drops it on a change (Req 16.6, 16.7)", () => {
    const d = doc(TEXT);
    const key = keyOf(d, "full");
    const base = withOverride(d, key);
    const same = unwrap(setVerification(base, key, { status: "unchecked", waitUntil: TS }));
    expect(same.overrides).toHaveLength(1);
    const changed = unwrap(setVerification(base, key, { status: "not_found" }));
    expect(changed.overrides).toHaveLength(0);
  });
});

describe("setQuoteCheck", () => {
  const quoteKey = (d: Document, n = 0): string => {
    const q = d.quotes[n];
    if (q === undefined) throw new Error("no quote");
    return q.key;
  };

  it("stores mismatch and drops the Override only when the result differs (Req 17.2, 17.4)", () => {
    const d = doc(TEXT);
    const key = quoteKey(d);
    const mm = unwrap(
      setQuoteCheck(withOverride(d, key), key, { status: "mismatch", prefixLength: 3 }),
    );
    expect(mm.quotes[0]?.result).toEqual({ status: "mismatch", prefixLength: 3 });
    expect(mm.overrides).toHaveLength(0);
    const same = unwrap(setQuoteCheck(withOverride(d, key), key, { status: "unchecked" }));
    expect(same.overrides).toHaveLength(1);
  });

  it("rejects unknown keys and bad prefixes (Req 17.3, 17.5)", () => {
    const d = doc(TEXT);
    const key = quoteKey(d);
    const len = (d.quotes[0]?.quote.end ?? 0) - (d.quotes[0]?.quote.start ?? 0);
    expect(setQuoteCheck(d, "k999", { status: "match" })).toEqual({
      ok: false,
      error: { kind: "unknown_quote", key: "k999" },
    });
    for (const p of [-1, 1.5, len, Number.NaN]) {
      const r = setQuoteCheck(d, key, { status: "mismatch", prefixLength: p });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("invalid_quote_result");
    }
  });

  it("rejects a quote on an Orphan with not_verifiable (Req 13.4, 17.8)", () => {
    const d = doc('Id. "the right of privacy is broad."');
    const q = d.quotes[0];
    if (q === undefined) throw new Error("expected a quote on the Orphan");
    expect(setQuoteCheck(d, q.key, { status: "match" })).toEqual({
      ok: false,
      error: { kind: "not_verifiable", key: q.key },
    });
  });
});
