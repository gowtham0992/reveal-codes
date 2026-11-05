import { describe, expect, it } from "vitest";
import { apply, createDocument } from "../src/document";
import type { Applied, Document, Operation, Provenance } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";

const AI_R1: Provenance = { origin: "AI", runId: "r1", timestamp: T2 };
const AI_HUM_R1: Provenance = { origin: "AI>HUM", runId: "r1", timestamp: T2 };

function applied(doc: Document, op: Operation): Applied {
  // No config: the default Relabel_Threshold 0.4 applies (Req 6.10).
  const result = apply(doc, op);
  if (!result.ok) throw new Error(`fixture: apply failed with ${result.error.kind}`);
  return result.value;
}

/** An empty Document plus one ten-code-unit insert from assistant run r1. */
function tenUnitRun(): Document {
  const empty = createDocument("", T1);
  if (!empty.ok) throw new Error("fixture: createDocument failed");
  return applied(empty.value, { kind: "insert", at: 0, text: "0123456789", provenance: AI_R1 })
    .document;
}

const humDelete = (from: number, to: number): Operation => ({
  kind: "delete",
  from,
  to,
  actor: "HUM",
});

describe("default Relabel_Threshold boundary _Requirements: 6.10_", () => {
  it("does not relabel a Run whose Edited_Proportion is exactly 0.4", () => {
    const { document } = applied(tenUnitRun(), humDelete(0, 4));
    expect(document.text).toBe("456789");
    expect(document.runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 4, relabelled: false },
    ]);
    expect(document.spans).toEqual([{ start: 0, end: 6, provenance: AI_R1 }]);
  });

  it("relabels the Run once one more code unit is deleted", () => {
    const atForty = applied(tenUnitRun(), humDelete(0, 4)).document;
    const { document } = applied(atForty, humDelete(0, 1));
    expect(document.text).toBe("56789");
    expect(document.runs).toEqual([
      { runId: "r1", originalLength: 10, editedCount: 5, relabelled: true },
    ]);
    expect(document.spans).toEqual([{ start: 0, end: 5, provenance: AI_HUM_R1 }]);
  });
});
