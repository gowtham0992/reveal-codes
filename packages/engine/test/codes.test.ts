import { describe, expect, it } from "vitest";
import { check } from "../src/codes/check.js";
import { decodeTokens } from "../src/codes/decode.js";
import { lexCodes } from "../src/codes/lex.js";
import { render } from "../src/codes/render.js";
import { createDocument } from "../src/document.js";

const TS = "2026-11-03T10:00:00Z";

function fullRendering(text: string): string {
  const d = createDocument(text, TS);
  if (!d.ok) throw new Error(`createDocument failed: ${d.error.kind}`);
  return render(d.value, "full").text;
}

// TODO(8.7): re-point at `parse` once the codes.ts facade exists.
function lexDecodeCheck(input: string) {
  const lexed = lexCodes(input);
  if (!lexed.ok) throw new Error(`lex fault in test input: ${lexed.error.rule}`);
  const decoded = decodeTokens(lexed.value);
  if (!decoded.ok) throw new Error(`decode fault in test input: ${decoded.error.rule}`);
  return check(decoded.value);
}

describe("codes check (_Requirements: 20.4, 20.5, 16.5_)", () => {
  it("Parse rejects a verified code on an unlisted LEXIS citation", () => {
    const rendered = fullRendering("2023 Foo Cty. Ct. LEXIS 5");
    expect(rendered).toContain("[CIT …{k=k0}]");
    const tampered = rendered.replace("[CIT …{k=k0}]", "[CIT ✓{k=k0;cl=1}]");
    const r = lexDecodeCheck(tampered);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ index: tampered.indexOf("[CIT ✓"), rule: "unverifiable_status" });
  });

  it("accepts a verified code on a listed LEXIS court", () => {
    const rendered = fullRendering("2023 U.S. Dist. LEXIS 5");
    const tampered = rendered.replace("[CIT …{k=k0}]", "[CIT ✓{k=k0;cl=1}]");
    expect(tampered).not.toBe(rendered);
    expect(lexDecodeCheck(tampered).ok).toBe(true);
  });

  it("rejects a citation Code placed at an Other_Reference range", () => {
    const rendered = fullRendering("See 5 U.S.C. § 1 here.");
    const tampered = rendered.replace("[REF]", "[CIT …{k=k0}]").replace("[/REF]", "[/CIT]");
    const r = lexDecodeCheck(tampered);
    expect(r.ok ? undefined : r.error.rule).toBe("ref_code");
  });

  it("rejects a missing [REF] pair as an Extractor mismatch", () => {
    const rendered = fullRendering("See 5 U.S.C. § 1 here.");
    const tampered = rendered.replace("[REF]", "").replace("[/REF]", "");
    const r = lexDecodeCheck(tampered);
    expect(r.ok ? undefined : r.error.rule).toBe("extractor_mismatch");
  });

  it("rejects a [QUO …] pair on a quote that attaches to nothing", () => {
    const rendered = fullRendering('He said "hello" there.');
    const tampered = rendered
      .replace("n=0", "n=1")
      .replace('"hello"', '[QUO …{k=k0}]"hello"[/QUO]');
    const r = lexDecodeCheck(tampered);
    expect(r.ok ? undefined : r.error.rule).toBe("extractor_mismatch");
  });
});
