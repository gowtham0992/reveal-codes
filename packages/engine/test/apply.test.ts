import { describe, expect, it } from "vitest";
import { apply, createDocument } from "../src/document";
import type { Applied, Document, Operation, Provenance } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";
const HUM: Provenance = { origin: "HUM", timestamp: T2 };

function base(text = "The motion should be granted."): Document {
  const created = createDocument(text, T1);
  if (!created.ok) throw new Error("fixture: createDocument failed");
  return created.value;
}

function applied(doc: Document, op: Operation): Applied {
  const result = apply(doc, op);
  if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
  return result.value;
}

const insertHum: Operation = { kind: "insert", at: 4, text: "new ", provenance: HUM };

describe("apply config validation _Requirements: 5.2_", () => {
  it("rejects an out-of-range threshold for a Caller_Operation", () => {
    const result = apply(base(), insertHum, { relabelThreshold: 0 });
    expect(result).toEqual({
      ok: false,
      error: { kind: "invalid_config", field: "relabelThreshold", value: 0 },
    });
  });

  it("validates the config before routing an Inverse (design A2 order)", () => {
    const doc = base();
    const { inverse } = applied(doc, insertHum);
    const result = apply(inverse.expect, inverse, { relabelThreshold: Number.NaN });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_config");
  });
});

describe("apply Inverse routing _Requirements: 5.1, 7.7_", () => {
  it("undoes an Insert and redoes it through apply", () => {
    const doc = base();
    const forward = applied(doc, insertHum);
    expect(forward.document.text).toBe("The new motion should be granted.");
    const undo = applied(forward.document, forward.inverse);
    expect(undo.document).toStrictEqual(doc);
    const redo = applied(undo.document, undo.inverse);
    expect(redo.document).toStrictEqual(forward.document);
  });

  it("returns stale_inverse for a Document other than the Inverse's", () => {
    const doc = base();
    const { inverse } = applied(doc, insertHum);
    expect(apply(doc, inverse)).toEqual({ ok: false, error: { kind: "stale_inverse" } });
  });
});

describe("apply Caller_Operation validation _Requirements: 5.2_", () => {
  it("passes the validation error through and leaves the Document unchanged", () => {
    const doc = base();
    const snapshot = structuredClone(doc);
    const result = apply(doc, { kind: "delete", from: 5, to: 2, actor: "HUM" });
    expect(result).toEqual({ ok: false, error: { kind: "inverted_range", from: 5, to: 2 } });
    expect(doc).toStrictEqual(snapshot);
  });
});

describe("apply no-ops _Requirements: 4.7, 4.10, 5.1_", () => {
  const noOps: readonly Operation[] = [
    { kind: "insert", at: 3, text: "", provenance: HUM },
    { kind: "delete", from: 7, to: 7, actor: "HUM" },
    { kind: "replace", from: 0, to: 0, text: "", provenance: HUM },
  ];

  for (const op of noOps) {
    it(`returns the input Document and a restoring Inverse for an empty ${op.kind}`, () => {
      const doc = base();
      const result = applied(doc, op);
      expect(result.document).toBe(doc);
      const undo = applied(result.document, result.inverse);
      expect(undo.document).toStrictEqual(doc);
    });
  }

  it("treats Delete(0, 0) on an empty Document as a no-op", () => {
    const doc = base("");
    const result = applied(doc, { kind: "delete", from: 0, to: 0, actor: "HUM" });
    expect(result.document).toBe(doc);
  });
});

describe("apply dispatch _Requirements: 4.10, 5.1_", () => {
  it("dispatches an Insert into an empty Document as one Span", () => {
    const { document } = applied(base(""), { kind: "insert", at: 0, text: "Hi", provenance: HUM });
    expect(document.text).toBe("Hi");
    expect(document.spans).toEqual([{ start: 0, end: 2, provenance: HUM }]);
  });

  it("dispatches a Delete", () => {
    const doc = base();
    const { document, inverse } = applied(doc, { kind: "delete", from: 3, to: 10, actor: "HUM" });
    expect(document.text).toBe("The should be granted.");
    expect(applied(document, inverse).document).toStrictEqual(doc);
  });

  it("dispatches a Replace", () => {
    const doc = base();
    const op: Operation = { kind: "replace", from: 21, to: 28, text: "denied", provenance: HUM };
    const { document, inverse } = applied(doc, op);
    expect(document.text).toBe("The motion should be denied.");
    expect(document.spans).toEqual([
      { start: 0, end: 21, provenance: { origin: "PST", timestamp: T1 } },
      { start: 21, end: 27, provenance: HUM },
      { start: 27, end: 28, provenance: { origin: "PST", timestamp: T1 } },
    ]);
    expect(applied(document, inverse).document).toStrictEqual(doc);
  });
});
