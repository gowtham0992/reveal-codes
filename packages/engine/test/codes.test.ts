import { describe, expect, it } from "vitest";
import { parse, render } from "../src/codes.js";
import { createDocument } from "../src/document.js";
import { structuralEqual } from "../src/equal.js";
import { setVerification } from "../src/verification.js";

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
