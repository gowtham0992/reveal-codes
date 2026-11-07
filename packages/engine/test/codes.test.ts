import { describe, expect, it } from "vitest";
import { parse, render } from "../src/codes.js";
import { apply, createDocument } from "../src/document.js";
import { structuralEqual } from "../src/equal.js";
import { recordOverride } from "../src/issues.js";
import type { Document, Operation } from "../src/types.js";
import { setQuoteCheck, setVerification } from "../src/verification.js";

const TS = "2026-11-03T10:00:00Z";

function fullRendering(text: string): string {
  const d = createDocument(text, TS);
  if (!d.ok) throw new Error(`createDocument failed: ${d.error.kind}`);
  return render(d.value, "full").text;
}

describe("codes check (_Requirements: 20.4, 20.5, 16.5_)", () => {
  it("Parse rejects a verified code on an unlisted LEXIS citation", () => {
    const rendered = fullRendering("2023 Foo Cty. Ct. LEXIS 5");
    expect(rendered).toContain("[CIT …{k=k0}]");
    const tampered = rendered.replace("[CIT …{k=k0}]", "[CIT ✓{k=k0;cl=1}]");
    const r = parse(tampered);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({
      kind: "malformed_codes",
      index: tampered.indexOf("[CIT ✓"),
      rule: "unverifiable_status",
    });
  });

  it("accepts a verified code on a listed LEXIS court", () => {
    const rendered = fullRendering("2023 U.S. Dist. LEXIS 5");
    const tampered = rendered.replace("[CIT …{k=k0}]", "[CIT ✓{k=k0;cl=1}]");
    expect(tampered).not.toBe(rendered);
    expect(parse(tampered).ok).toBe(true);
  });

  it("rejects a citation Code placed at an Other_Reference range", () => {
    const rendered = fullRendering("See 5 U.S.C. § 1 here.");
    const tampered = rendered.replace("[REF]", "[CIT …{k=k0}]").replace("[/REF]", "[/CIT]");
    const r = parse(tampered);
    expect(r.ok ? undefined : r.error).toMatchObject({ rule: "ref_code" });
  });

  it("rejects a missing [REF] pair as an Extractor mismatch", () => {
    const rendered = fullRendering("See 5 U.S.C. § 1 here.");
    const tampered = rendered.replace("[REF]", "").replace("[/REF]", "");
    const r = parse(tampered);
    expect(r.ok ? undefined : r.error).toMatchObject({ rule: "extractor_mismatch" });
  });

  it("rejects a [QUO …] pair on a quote that attaches to nothing", () => {
    const rendered = fullRendering('He said "hello" there.');
    const tampered = rendered
      .replace("n=0", "n=1")
      .replace('"hello"', '[QUO …{k=k0}]"hello"[/QUO]');
    const r = parse(tampered);
    expect(r.ok ? undefined : r.error).toMatchObject({ rule: "extractor_mismatch" });
  });
});

describe("parse (_Requirements: 20.1, 20.2, 20.6_)", () => {
  it("round-trips a document with citations, a quote, a result, and an override", () => {
    const text = 'See Roe v. Wade, 410 U.S. 113, 116 (1973) ("hello world"). Id. at 120.';
    const created = createDocument(text, TS);
    if (!created.ok) throw new Error("createDocument failed");
    const key = created.value.citations.flatMap((c) => (c.kind === "full" ? [c.key] : []))[0];
    if (key === undefined) throw new Error("no full citation");
    const verified = setVerification(created.value, key, { status: "not_found", reason: "a;b]" });
    if (!verified.ok) throw new Error("setVerification failed");
    const parsed = parse(render(verified.value, "full").text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(structuralEqual(parsed.value, verified.value)).toBe(true);
  });

  it("returns malformed_codes at index 0 for the empty string", () => {
    expect(parse("")).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: 0, rule: "missing_doc" },
    });
  });
});

// Examples for the Renderer (tasks 8.15).

const T1 = "2026-11-03T10:01:00Z";
const T2 = "2026-11-03T10:05:00Z";

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`unexpected error: ${r.error.kind}`);
  return r.value;
}

function applied(doc: Document, op: Operation): Document {
  const r = apply(doc, op);
  if (!r.ok) throw new Error(`apply failed: ${r.error.kind}`);
  return r.value.document;
}

/** The design's full/display example (Data Models, "Example (full, then display)"). */
function designDocument(): Document {
  const base = must(createDocument("See 410 U.S. 999, and ", TS));
  const withAi = applied(base, {
    kind: "insert",
    at: base.text.length,
    text: "42 [sic] \u2026",
    provenance: { origin: "AI", runId: "r1", timestamp: T1 },
  });
  const cit = withAi.citations[0];
  if (cit === undefined || cit.kind !== "full") throw new Error("no full citation");
  const failed = must(setVerification(withAi, cit.key, { status: "not_found" }));
  return must(recordOverride(failed, cit.key, "Typo in source", T2));
}

describe("render: empty Document (_Requirements: 19.9_)", () => {
  const empty = must(createDocument("", TS));

  it("full mode is only [DOC] with one position at Offset 0", () => {
    const r = render(empty, "full");
    expect(r.text).toMatch(/^\[DOC[^\]]*\]$/);
    expect(r.positions).toEqual([{ offset: 0, code: r.text }]);
  });

  it("display mode is the empty string with no positions", () => {
    expect(render(empty, "display")).toEqual({ text: "", positions: [] });
  });
});

describe("parse of non-Full renderings (_Requirements: 20.3_)", () => {
  const missingDoc = {
    ok: false,
    error: { kind: "malformed_codes", index: 0, rule: "missing_doc" },
  };

  // The field-less `[PST]` is also a bad_field at 0; missing_doc wins the tie.
  it("rejects a display rendering with missing_doc at 0", () => {
    const d = must(createDocument("Plain text.", TS));
    const display = render(d, "display").text;
    expect(display).toBe("[PST]Plain text.");
    expect(parse(display)).toEqual(missingDoc);
  });

  it("rejects the display rendering of the empty Document (empty string)", () => {
    const display = render(must(createDocument("", TS)), "display").text;
    expect(display).toBe("");
    expect(parse(display)).toEqual(missingDoc);
  });
});

describe("parse reports the lowest fault across lex and decode (_Requirements: 20.3_)", () => {
  const DOC = "[DOC{v=1;n=0}]";
  const OK_T = "2026-11-03T10:00:00Z";

  it("reports a decode-level bad timestamp that precedes a later lex-level unknown code", () => {
    const r = parse(`${DOC}[PST{t=not-a-time}]x[ZZZ]`);
    expect(r).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: DOC.length, rule: "bad_field" },
    });
  });

  it("reports a decode-level ovr_position that precedes a later lex-level unbalanced close", () => {
    const r = parse(`${DOC}[PST{t=${OK_T}}][OVR:why{t=${OK_T}}]x[/CIT]`);
    expect(r).toEqual({
      ok: false,
      error: {
        kind: "malformed_codes",
        index: DOC.length + `[PST{t=${OK_T}}]`.length,
        rule: "ovr_position",
      },
    });
  });

  it("lets the lex-level fault win when it is the lower one", () => {
    const r = parse(`${DOC}[ZZZ][PST{t=not-a-time}]`);
    expect(r).toEqual({
      ok: false,
      error: { kind: "malformed_codes", index: DOC.length, rule: "unknown_code" },
    });
  });
});

describe("render: design example (_Requirements: 19.1, 19.10_)", () => {
  const designDisplay =
    "[PST]See [CIT \u2718][OVR:Typo in source]410 U.S. 999[/CIT], and [AI:r1]42 \\[sic\\] \u2026";
  const designFull =
    "[DOC{v=1;n=1;r=r1,10,0,0}][PST{t=2026-11-03T10:00:00Z}]See [CIT \u2718{k=k0}]" +
    "[OVR:Typo in source{t=2026-11-03T10:05:00Z}]410 U.S. 999[/CIT], and " +
    "[AI:r1{t=2026-11-03T10:01:00Z}]42 \\[sic\\] \u2026";

  it("display mode equals the design's display string exactly", () => {
    expect(render(designDocument(), "display").text).toBe(designDisplay);
  });

  it("full mode equals the design's full string verbatim, header included", () => {
    expect(render(designDocument(), "full").text).toBe(designFull);
  });
});

/** One Document per Code family so every Code of the vocabulary is emitted. */
function codeDocuments(): Document[] {
  const text =
    'A 410 U.S. 113 ("one"). B 347 U.S. 483 ("two"). C 384 U.S. 436 ("three"). ' +
    "D 5 U.S. 137. See 5 U.S.C. \u00a7 1 here.";
  let d = must(createDocument(text, TS));
  const cits = d.citations.flatMap((c) => (c.kind === "full" ? [c.key] : []));
  const [c0, c1, c2] = cits;
  const quotes = d.quotes.map((q) => q.key);
  const [q0, q1] = quotes;
  if (c0 === undefined || c1 === undefined || c2 === undefined) throw new Error("citations");
  if (q0 === undefined || q1 === undefined || quotes.length !== 3) throw new Error("quotes");
  d = must(setVerification(d, c0, { status: "verified", clusterId: "9" }));
  d = must(setVerification(d, c1, { status: "not_found" }));
  d = must(setVerification(d, c2, { status: "ambiguous", candidates: ["1", "2"] }));
  d = must(setQuoteCheck(d, q0, { status: "match" }));
  d = must(setQuoteCheck(d, q1, { status: "mismatch", prefixLength: 1 }));
  d = must(recordOverride(d, c1, "Typo", T2));

  const hum = applied(must(createDocument("", TS)), {
    kind: "insert",
    at: 0,
    text: "typed",
    provenance: { origin: "HUM", timestamp: TS },
  });
  const ai = applied(must(createDocument("", TS)), {
    kind: "insert",
    at: 0,
    text: "abcdefghij",
    provenance: { origin: "AI", runId: "r2", timestamp: T1 },
  });
  const edited = applied(ai, { kind: "delete", from: 0, to: 5, actor: "HUM" });
  return [d, hum, ai, edited];
}

describe("render: every Code appears (_Requirements: 19.1, 19.10_)", () => {
  const docs = codeDocuments();
  const full = docs.flatMap((d) => render(d, "full").positions.map((p) => p.code));
  const display = docs.flatMap((d) => render(d, "display").positions.map((p) => p.code));
  const expected = [
    "[HUM",
    "[PST",
    "[AI:r2",
    "[AI>HUM:r2",
    "[CIT \u2713",
    "[CIT \u2718",
    "[CIT ?:2",
    "[CIT \u2026",
    "[QUO \u2713",
    "[QUO \u2718",
    "[QUO \u2026",
    "[REF]",
    "[/CIT]",
    "[/QUO]",
    "[/REF]",
    "[OVR:Typo",
  ];

  it.each(expected)("%s appears in the full and the display rendering", (prefix) => {
    expect(full.some((c) => c.startsWith(prefix))).toBe(true);
    expect(display.some((c) => c.startsWith(prefix))).toBe(true);
  });

  it("[DOC] appears in the full rendering only", () => {
    expect(full.some((c) => c.startsWith("[DOC"))).toBe(true);
    expect(display.some((c) => c.startsWith("[DOC"))).toBe(false);
  });
});
