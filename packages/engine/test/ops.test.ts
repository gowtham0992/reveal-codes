import { describe, expect, it } from "vitest";
import { apply, createDocument } from "../src/document";
import type { Applied, Document, Operation, Provenance } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";
const T3 = "2026-11-03T10:09:00Z";

const ai = (runId: string, timestamp: string): Provenance => ({ origin: "AI", runId, timestamp });

function created(text: string): Document {
  const result = createDocument(text, T1);
  if (!result.ok) throw new Error(`fixture: createDocument failed with ${result.error.kind}`);
  return result.value;
}

function applied(doc: Document, op: Operation): Applied {
  const result = apply(doc, op);
  if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
  return result.value;
}

/** "See " pasted, then ten code units from run r1 and three from run r2. */
function twoRuns(): Document {
  const withR1 = applied(created("See "), {
    kind: "insert",
    at: 4,
    text: "0123456789",
    provenance: ai("r1", T2),
  }).document;
  return applied(withR1, { kind: "insert", at: 14, text: "XYZ", provenance: ai("r2", T3) })
    .document;
}

describe("Delete-all _Requirements: 4.5_", () => {
  it("empties Text and Spans and keeps every Run with its Original_Length", () => {
    const doc = twoRuns();
    expect(doc.runs.map((r) => [r.runId, r.originalLength])).toEqual([
      ["r1", 10],
      ["r2", 3],
    ]);
    const { document, inverse } = applied(doc, {
      kind: "delete",
      from: 0,
      to: doc.text.length,
      actor: "HUM",
    });
    expect(document.text).toBe("");
    expect(document.spans).toEqual([]);
    expect(document.runs.map((r) => [r.runId, r.originalLength])).toEqual([
      ["r1", 10],
      ["r2", 3],
    ]);
    expect(applied(document, inverse).document).toStrictEqual(doc);
  });
});

describe("operations on an empty Document _Requirements: 4.10_", () => {
  it("treats Delete(0, 0) as a no-op with an Inverse that restores the Document", () => {
    const doc = created("");
    const { document, inverse } = applied(doc, { kind: "delete", from: 0, to: 0, actor: "HUM" });
    expect(document).toBe(doc);
    expect(document.text).toBe("");
    expect(document.spans).toEqual([]);
    expect(applied(document, inverse).document).toStrictEqual(doc);
  });
});

describe("AI>HUM Caller_Operation _Requirements: 7.4_", () => {
  it("rejects an Insert with Origin AI>HUM as invalid_provenance and leaves the Document unchanged", () => {
    const doc = twoRuns();
    const snapshot = structuredClone(doc);
    const result = apply(doc, {
      kind: "insert",
      at: 4,
      text: "edited",
      provenance: { origin: "AI>HUM", runId: "r1", timestamp: T3 },
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_provenance", field: "origin", value: "AI>HUM" },
    });
    expect(doc).toStrictEqual(snapshot);
  });
});
