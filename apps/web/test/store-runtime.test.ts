import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { createStore } from "../src/store-runtime";
import { createManualClock } from "./support/clock";

const ISO = "2026-01-01T00:00:00.000Z";
const insertA = {
  kind: "insert",
  at: 0,
  text: "a",
  provenance: { origin: "HUM", timestamp: ISO },
} as const;

describe("createStore", () => {
  it("returns the ActionResult synchronously and updates getState", () => {
    const store = createStore(createManualClock().now);
    const result = store.dispatch({ type: "edit", ops: [insertA] });
    expect(result.changed).toBe(true);
    expect(result.state).toBe(store.getState());
    expect(store.getState().document.text).toBe("a");
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const store = createStore(createManualClock().now);
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.dispatch({ type: "edit", ops: [insertA] });
    expect(calls).toBe(1);
    off();
    store.dispatch({ type: "notice", text: "x" });
    expect(calls).toBe(1);
  });

  it("does not notify when the state is unchanged", () => {
    const store = createStore(createManualClock().now);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const r = store.dispatch({ type: "undo" });
    expect(r.changed).toBe(false);
    expect(calls).toBe(0);
  });

  it("surfaces errors and keeps the state on rejected edits", () => {
    const store = createStore(createManualClock().now);
    const before = store.getState();
    const r = store.dispatch({ type: "edit", ops: [{ ...insertA, at: 5 }] });
    expect(r.error?.kind).toBe("out_of_range");
    expect(store.getState().document).toBe(before.document);
    expect(store.getState().notice).toContain("out_of_range");
  });

  it("installs a replacement Document and bumps epoch", () => {
    const store = createStore(createManualClock().now);
    const created = createDocument("hello", ISO);
    if (!created.ok) throw new Error("fixture rejected");
    store.dispatch({ type: "replace", document: created.value });
    expect(store.getState().document.text).toBe("hello");
    expect(store.getState().epoch).toBe(1);
  });
});
