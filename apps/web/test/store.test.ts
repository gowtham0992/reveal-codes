import { createDocument } from "@reveal-codes/engine";
import type { CallerOperation, Document, Origin } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { reduce, initialState } from "../src/store";
import type { StoreAction, StoreState } from "../src/store";
import { createManualClock } from "./support/clock";

const ISO = "2026-01-01T00:00:00.000Z";
const clock = createManualClock();
const now = clock.now;

function insert(at: number, text: string, origin: Origin = "HUM"): CallerOperation {
  return { kind: "insert", at, text, provenance: { origin, timestamp: ISO } };
}
function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture document rejected");
  return created.value;
}
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
const CITED = 'See Roe v. Wade, 410 U.S. 113 (1973) ("the right of privacy").';
function citedState(): StoreState {
  const base = initialState(now);
  return { ...base, document: docOf(CITED) };
}
function firstKeys(state: StoreState): { cit: string; quo: string | null } {
  const first = state.document.citations.find((c) => c.kind === "full");
  const cit = first?.kind === "full" ? first.key : undefined;
  if (cit === undefined) throw new Error("fixture has no citation");
  return { cit, quo: state.document.quotes[0]?.key ?? null };
}
function run(state: StoreState, ...actions: StoreAction[]): StoreState {
  return actions.reduce((s, a) => reduce(s, a, now).state, state);
}

describe("initialState", () => {
  it("starts with an empty Document from createDocument and empty stacks", () => {
    const s = initialState(now);
    expect(s.document).toEqual(docOf(""));
    expect(s.document.text).toBe("");
    expect(s.undo).toEqual([]);
    expect(s.redo).toEqual([]);
    expect(s.runLog).toEqual([]);
    expect(s.notice).toBeNull();
    expect(s.epoch).toBe(0);
  });
});

describe("edit", () => {
  it("applies operations in order and pushes one undo group", () => {
    const r = reduce(
      initialState(now),
      { type: "edit", ops: [insert(0, "ab"), insert(2, "c")] },
      now,
    );
    expect(r.state.document.text).toBe("abc");
    expect(r.state.undo).toHaveLength(1);
    expect(r.state.undo[0]?.group).toHaveLength(2);
    expect(r.changed).toBe(true);
    expect(r.error).toBeNull();
  });

  it("clears the redo stack and the notice on success", () => {
    const s0 = run(initialState(now), { type: "edit", ops: [insert(0, "ab")] }, { type: "undo" });
    expect(s0.redo).toHaveLength(1);
    const s1 = run({ ...s0, notice: "old" }, { type: "edit", ops: [insert(0, "x")] });
    expect(s1.redo).toEqual([]);
    expect(s1.notice).toBeNull();
  });

  it("keeps Document and stacks and names the error kind when an operation is rejected", () => {
    const s0 = run(initialState(now), { type: "edit", ops: [insert(0, "ab")] });
    const r = reduce(s0, { type: "edit", ops: [insert(0, "x"), insert(99, "y")] }, now);
    expect(r.error?.kind).toBe("out_of_range");
    expect(r.state.document).toBe(s0.document);
    expect(r.state.undo).toBe(s0.undo);
    expect(r.state.redo).toBe(s0.redo);
    expect(r.state.notice).toContain("out_of_range");
    expect(r.changed).toBe(false);
  });

  it("coalesces typing within the window using the injected clock", () => {
    const c = createManualClock();
    const a = reduce(initialState(c.now), { type: "edit", ops: [insert(0, "a")] }, c.now);
    c.advance(500);
    const b = reduce(a.state, { type: "edit", ops: [insert(1, "b")] }, c.now);
    expect(b.state.undo).toHaveLength(1);
    c.advance(1500);
    const d = reduce(b.state, { type: "edit", ops: [insert(2, "c")] }, c.now);
    expect(d.state.undo).toHaveLength(2);
  });

  it("leaves state unchanged for an empty operation list", () => {
    const s = initialState(now);
    const r = reduce(s, { type: "edit", ops: [] }, now);
    expect(r.state).toBe(s);
    expect(r.changed).toBe(false);
  });
});

describe("undo and redo", () => {
  it("restore the Document and report the caret", () => {
    const s1 = run(initialState(now), { type: "edit", ops: [insert(0, "hello")] });
    const u = reduce(s1, { type: "undo" }, now);
    expect(u.state.document.text).toBe("");
    expect(u.state.undo).toEqual([]);
    expect(u.state.redo).toHaveLength(1);
    expect(u.caret).toBe(0);
    const r = reduce(u.state, { type: "redo" }, now);
    expect(r.state.document.text).toBe("hello");
    expect(r.state.undo).toHaveLength(1);
    expect(r.caret).toBe(5);
  });

  it("leave state unchanged on empty stacks", () => {
    const s = initialState(now);
    expect(reduce(s, { type: "undo" }, now).state).toBe(s);
    expect(reduce(s, { type: "redo" }, now).state).toBe(s);
    expect(reduce(s, { type: "undo" }, now).changed).toBe(false);
  });

  it("keep the state and set a notice on a stale inverse", () => {
    const s1 = run(initialState(now), { type: "edit", ops: [insert(0, "hello")] });
    const stale: StoreState = { ...s1, document: docOf("zzz") };
    const r = reduce(stale, { type: "undo" }, now);
    expect(r.error?.kind).toBe("stale_inverse");
    expect(r.state.document).toBe(stale.document);
    expect(r.state.undo).toBe(stale.undo);
    expect(r.state.redo).toBe(stale.redo);
    expect(r.state.notice).toContain("Undo not applied");
    expect(r.caret).toBeNull();
  });
});

describe("verification and quoteCheck", () => {
  it("apply pairs, count skipped pairs and apply the History_Barrier", () => {
    const s0 = run(citedState(), { type: "edit", ops: [insert(0, "x")] });
    const { cit } = firstKeys(s0);
    const r = reduce(
      s0,
      {
        type: "verification",
        pairs: [
          [cit, { status: "not_found" }],
          ["k999", { status: "not_found" }],
        ],
      },
      now,
    );
    expect(r.skipped).toBe(1);
    expect(r.changed).toBe(true);
    expect(r.state.undo).toEqual([]);
    expect(r.state.redo).toEqual([]);
    expect(
      r.state.document.citations.find((c) => c.kind === "full" && c.key === cit),
    ).toMatchObject({
      result: { status: "not_found" },
    });
  });

  it("leave the state untouched when every pair is skipped", () => {
    const s0 = run(citedState(), { type: "edit", ops: [insert(0, "x")] });
    const r = reduce(s0, { type: "verification", pairs: [["k999", { status: "not_found" }]] }, now);
    expect(r.skipped).toBe(1);
    expect(r.state).toBe(s0);
    expect(r.state.undo).toHaveLength(1);
  });

  it("apply quote checks with skipped count and barrier", () => {
    const s0 = run(citedState(), { type: "edit", ops: [insert(0, "x")] });
    const quo = firstKeys(s0).quo;
    expect(quo).not.toBeNull();
    const r = reduce(
      s0,
      {
        type: "quoteCheck",
        pairs: [
          [quo ?? "", { status: "mismatch", prefixLength: 3 }],
          ["k999", { status: "match" }],
        ],
      },
      now,
    );
    expect(r.skipped).toBe(1);
    expect(r.state.undo).toEqual([]);
    expect(r.state.document.quotes[0]?.result).toEqual({ status: "mismatch", prefixLength: 3 });
  });
});

describe("override", () => {
  it("records the override and applies the History_Barrier", () => {
    const s0 = run(citedState(), { type: "edit", ops: [insert(0, "x")] });
    const { cit } = firstKeys(s0);
    const r = reduce(
      s0,
      { type: "override", key: cit, reason: "checked by hand", timestamp: ISO },
      now,
    );
    expect(r.error).toBeNull();
    expect(r.state.document.overrides).toHaveLength(1);
    expect(r.state.undo).toEqual([]);
  });

  it("keeps the Document and sets a notice naming the kind on error", () => {
    const s0 = run(citedState(), { type: "edit", ops: [insert(0, "x")] });
    const r = reduce(s0, { type: "override", key: "k999", reason: "why", timestamp: ISO }, now);
    expect(r.error?.kind).toBe("unknown_issue");
    expect(r.state.document).toBe(s0.document);
    expect(r.state.undo).toBe(s0.undo);
    expect(r.state.notice).toContain("unknown_issue");
  });
});

describe("replace and notice", () => {
  it("replace installs the Document, empties stacks and runLog, and bumps epoch", () => {
    const run1 = { runId: "r1", provider: "p", modelId: null, prompt: "q", timestamp: ISO };
    const s0 = {
      ...run(initialState(now), { type: "edit", ops: [insert(0, "a")] }),
      runLog: [run1],
    };
    const doc = docOf("fresh");
    const r = reduce({ ...s0, notice: "n" }, { type: "replace", document: doc }, now);
    expect(r.state.document).toBe(doc);
    expect(r.state.undo).toEqual([]);
    expect(r.state.redo).toEqual([]);
    expect(r.state.runLog).toEqual([]);
    expect(r.state.notice).toBeNull();
    expect(r.state.epoch).toBe(s0.epoch + 1);
  });

  it("replace keeps a supplied runLog", () => {
    const run1 = { runId: "r1", provider: "p", modelId: "m", prompt: "q", timestamp: ISO };
    const r = reduce(
      initialState(now),
      { type: "replace", document: docOf(""), runLog: [run1] },
      now,
    );
    expect(r.state.runLog).toEqual([run1]);
  });

  it("notice sets only the notice", () => {
    const s = initialState(now);
    const r = reduce(s, { type: "notice", text: "hello" }, now);
    expect(r.state).toEqual({ ...s, notice: "hello" });
    expect(r.changed).toBe(false);
  });
});

describe("immutability", () => {
  it("never mutates a deeply frozen state for any action", () => {
    const base = run(citedState(), { type: "edit", ops: [insert(0, "ab")] });
    const { cit, quo } = firstKeys(base);
    const withRedo = run(base, { type: "undo" });
    const actions: StoreAction[] = [
      { type: "edit", ops: [insert(0, "z")] },
      { type: "undo" },
      { type: "redo" },
      { type: "verification", pairs: [[cit, { status: "not_found" }]] },
      { type: "quoteCheck", pairs: [[quo ?? "", { status: "match" }]] },
      { type: "override", key: cit, reason: "r", timestamp: ISO },
      { type: "replace", document: docOf("q") },
      { type: "notice", text: "t" },
    ];
    for (const s of [base, withRedo]) {
      const frozen = deepFreeze(structuredClone(s));
      for (const a of actions) {
        expect(() => reduce(frozen, a, now)).not.toThrow();
      }
    }
  });
});
