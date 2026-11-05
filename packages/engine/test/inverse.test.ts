import { describe, expect, it } from "vitest";
import { applyInverse, makeInverse } from "../src/ops/inverse";
import type { Document, Inverse } from "../src/types";

const T1 = "2026-11-03T10:00:00Z";
const T2 = "2026-11-03T10:05:00Z";

/** "Hello world" typed by the author. */
const pre: Document = {
  text: "Hello world",
  spans: [{ start: 0, end: 11, provenance: { origin: "HUM", timestamp: T1 } }],
  runs: [],
  citations: [],
  quotes: [],
  overrides: [],
  keyCounter: 3,
};

/** Assistant run r1 replaced "world" with "brave new world" (AI text at [6, 21)). */
const post: Document = {
  text: "Hello brave new world",
  spans: [
    { start: 0, end: 6, provenance: { origin: "HUM", timestamp: T1 } },
    { start: 6, end: 21, provenance: { origin: "AI", runId: "r1", timestamp: T2 } },
  ],
  runs: [{ runId: "r1", originalLength: 15, editedCount: 0, relabelled: false }],
  citations: [],
  quotes: [],
  overrides: [{ key: "k3", reason: "checked by hand", timestamp: T2 }],
  keyCounter: 5,
};

const undo = (): Inverse => makeInverse(pre, post, 6, "world", 15);

describe("makeInverse / applyInverse _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7_", () => {
  it("shares the pre-operation arrays instead of copying them", () => {
    const inv = undo();
    expect(inv.expect).toBe(post);
    expect(inv.restore.spans).toBe(pre.spans);
    expect(inv.restore.runs).toBe(pre.runs);
    expect(inv.restore.overrides).toBe(pre.overrides);
    expect(inv.restore.keyCounter).toBe(3);
  });

  it("undo restores the pre-operation Document exactly, including keyCounter", () => {
    const res = applyInverse(post, undo());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.document).toStrictEqual(pre);
  });

  it("the redo Inverse applied to the undone Document restores the post-operation Document", () => {
    const undone = applyInverse(post, undo());
    if (!undone.ok) throw new Error("undo failed");
    const redone = applyInverse(undone.value.document, undone.value.inverse);
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.value.document).toStrictEqual(post);
    const again = applyInverse(redone.value.document, redone.value.inverse);
    expect(again.ok && again.value.document).toStrictEqual(pre);
  });

  it("restores runs and origins without relabelling or validating", () => {
    const relabelledPost: Document = {
      ...post,
      runs: [{ runId: "r1", originalLength: 15, editedCount: 9, relabelled: true }],
    };
    const inv = makeInverse(post, relabelledPost, 0, "", 0);
    const res = applyInverse(relabelledPost, inv);
    expect(res.ok && res.value.document).toStrictEqual(post);
  });

  it("rejects a different Document as stale and leaves it unchanged", () => {
    const other: Document = { ...post, keyCounter: 6 };
    const snapshot = structuredClone(other);
    expect(applyInverse(other, undo())).toStrictEqual({
      ok: false,
      error: { kind: "stale_inverse" },
    });
    expect(applyInverse(pre, undo())).toStrictEqual({
      ok: false,
      error: { kind: "stale_inverse" },
    });
    expect(other).toStrictEqual(snapshot);
  });

  it("accepts a structurally equal copy of the expected Document", () => {
    const copy = structuredClone(post);
    expect(copy).not.toBe(post);
    const res = applyInverse(copy, undo());
    expect(res.ok && res.value.document).toStrictEqual(pre);
  });
});
