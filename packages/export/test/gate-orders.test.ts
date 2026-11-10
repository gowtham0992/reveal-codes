import { apply } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { ORDERS, canExport, orderById } from "../src/index.js";
import type { OrderEntry } from "../src/index.js";
import { DEMO_VERIFIED_AT, buildDemoDocument } from "./support/demo-document.js";

// _Requirements: 5.2, 5.9, 5.10, 5.12, 9.7_

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error("fixture rejected");
  return r.value;
}

function entry(id: string): OrderEntry {
  const e = orderById(ORDERS, id);
  if (e === null) throw new Error(`missing entry ${id}`);
  return e;
}

function aiSpans(doc: Document) {
  return doc.spans.filter((s) => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM");
}

const NEWMAN = entry("sdohio-newman");

describe("canExport under sdohio-newman on the Demo_Document _Requirements: 5.2, 5.9, 5.10_", () => {
  it("is false although the document has no blocking issue", async () => {
    const doc = await buildDemoDocument();
    expect(aiSpans(doc)).toHaveLength(1);
    expect(canExport(doc, null)).toBe(true);
    expect(canExport(doc, NEWMAN)).toBe(false);
  });

  it("stays false after an edit beyond the relabel threshold makes the span AI>HUM", async () => {
    const doc = await buildDemoDocument();
    const ai = aiSpans(doc)[0];
    if (ai === undefined) throw new Error("demo document has no AI span");
    // Replace the middle 60% of the AI text with typed text: beyond the default 0.4 threshold.
    const size = ai.end - ai.start;
    const from = ai.start + Math.floor(size * 0.2);
    const to = ai.start + Math.floor(size * 0.8);
    const edited = must(
      apply(doc, {
        kind: "replace",
        from,
        to,
        text: "x".repeat(to - from),
        provenance: { origin: "HUM", timestamp: DEMO_VERIFIED_AT },
      }),
    ).document;
    const after = aiSpans(edited);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((s) => s.provenance.origin === "AI>HUM")).toBe(true);
    expect(canExport(edited, NEWMAN)).toBe(false);
  });

  it("becomes true only when the AI text is deleted", async () => {
    const doc = await buildDemoDocument();
    const ai = aiSpans(doc)[0];
    if (ai === undefined) throw new Error("demo document has no AI span");
    // Delete all but the last character: AI text remains, so the gate stays closed.
    const partial = must(
      apply(doc, { kind: "delete", from: ai.start, to: ai.end - 1, actor: "HUM" }),
    ).document;
    expect(aiSpans(partial).length).toBeGreaterThan(0);
    expect(canExport(partial, NEWMAN)).toBe(false);

    const deleted = must(
      apply(doc, { kind: "delete", from: ai.start, to: ai.end, actor: "HUM" }),
    ).document;
    expect(aiSpans(deleted)).toHaveLength(0);
    expect(canExport(deleted, NEWMAN)).toBe(true);
  });
});
