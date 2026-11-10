import { apply, createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { ORDERS, needsConfidentiality, orderById, prohibitionNotice } from "../src/index.js";
import type { OrderEntry } from "../src/index.js";

// _Requirements: 5.5, 5.12, 6.1, 6.6, 9.12_

const T0 = "2026-01-01T00:00:00.000Z";

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error("fixture rejected");
  return r.value;
}

function entry(id: string): OrderEntry {
  const e = orderById(ORDERS, id);
  if (e === null) throw new Error(`missing entry ${id}`);
  return e;
}

/** Pasted text with each range re-inserted by the real engine as AI text of run r1. */
function withAi(text: string, ranges: readonly (readonly [number, number])[]): Document {
  let doc = must(createDocument(text, T0));
  for (const [from, to] of ranges) {
    doc = must(
      apply(doc, {
        kind: "replace",
        from,
        to,
        text: text.slice(from, to),
        provenance: { origin: "AI", runId: "r1", timestamp: T0 },
      }),
    ).document;
  }
  return doc;
}

const TEXT = "one\ntwo\nthree";
const NO_AI = withAi(TEXT, []);
const ONE_SPAN = withAi(TEXT, [[4, 7]]);
const TWO_SPANS = withAi(TEXT, [
  [0, 3],
  [8, 13],
]);

const NEWMAN = entry("sdohio-newman");
const COURT_WIDE: OrderEntry = { ...NEWMAN, judge: null, instrument: "General Order 99-1" };

describe("prohibitionNotice _Requirements: 5.5, 5.12, 9.12_", () => {
  it("names the judge's surname for a Judge_Entry with one span", () => {
    expect(prohibitionNotice(ONE_SPAN, NEWMAN)).toEqual({
      line: "Judge Newman's order prohibits AI-drafted text. 1 AI-origin span remain at paragraphs 2.",
      keyLanguage: NEWMAN.key_language,
    });
  });

  it("names the judge's surname for a Judge_Entry with two spans", () => {
    expect(prohibitionNotice(TWO_SPANS, NEWMAN)).toEqual({
      line: "Judge Newman's order prohibits AI-drafted text. 2 AI-origin spans remain at paragraphs 1, 3.",
      keyLanguage: NEWMAN.key_language,
    });
  });

  it("names the instrument for a Court_Wide_Entry with one span", () => {
    expect(prohibitionNotice(ONE_SPAN, COURT_WIDE)?.line).toBe(
      "General Order 99-1 prohibits AI-drafted text. 1 AI-origin span remain at paragraphs 2.",
    );
  });

  it("names the instrument for a Court_Wide_Entry with two spans", () => {
    expect(prohibitionNotice(TWO_SPANS, COURT_WIDE)?.line).toBe(
      "General Order 99-1 prohibits AI-drafted text. 2 AI-origin spans remain at paragraphs 1, 3.",
    );
  });

  it("joins consecutive paragraphs with an en dash", () => {
    const doc = withAi(TEXT, [[0, 13]]);
    expect(prohibitionNotice(doc, NEWMAN)?.line).toBe(
      "Judge Newman's order prohibits AI-drafted text. 1 AI-origin span remain at paragraphs 1\u20133.",
    );
  });

  it("says paragraphs and never lines", () => {
    for (const doc of [ONE_SPAN, TWO_SPANS]) {
      const notice = prohibitionNotice(doc, NEWMAN);
      expect(notice?.line).toContain("paragraphs");
      expect(notice?.line.toLowerCase()).not.toContain("lines");
    }
  });

  it("is null when the document has no AI-origin span", () => {
    expect(prohibitionNotice(NO_AI, NEWMAN)).toBeNull();
    expect(prohibitionNotice(NO_AI, COURT_WIDE)).toBeNull();
  });

  it("is null for no entry and for an entry that does not prohibit", () => {
    expect(prohibitionNotice(ONE_SPAN, null)).toBeNull();
    expect(prohibitionNotice(ONE_SPAN, entry("edtex-love-2025"))).toBeNull();
  });
});

describe("needsConfidentiality _Requirements: 6.1, 6.6_", () => {
  const WITH = entry("cit-choe-groves-2025");
  const WITHOUT = entry("edtex-love-2025");
  const table: readonly (readonly [string, Document, OrderEntry | null, boolean])[] = [
    ["confidentiality element, AI used", ONE_SPAN, WITH, true],
    ["confidentiality element, no AI", NO_AI, WITH, false],
    ["no confidentiality element, AI used", ONE_SPAN, WITHOUT, false],
    ["no confidentiality element, no AI", NO_AI, WITHOUT, false],
    ["no entry, AI used", ONE_SPAN, null, false],
    ["no entry, no AI", NO_AI, null, false],
  ];

  it.each(table)("%s", (_name, doc, order, expected) => {
    expect(needsConfidentiality(doc, order)).toBe(expected);
  });
});
