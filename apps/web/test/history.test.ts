import { apply, createDocument } from "@reveal-codes/engine";
import type { CallerOperation, Document, Inverse, Origin } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { pushEdit, runRedo, runUndo } from "../src/history";
import type { UndoEntry } from "../src/history";

const ISO = "2026-01-01T00:00:00.000Z";

function insert(at: number, text: string, origin: Origin = "HUM"): CallerOperation {
  return { kind: "insert", at, text, provenance: { origin, timestamp: ISO } };
}

function startDoc(text = ""): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture document rejected");
  return created.value;
}

type Step = Readonly<{ document: Document; inverses: readonly Inverse[] }>;

function run(doc: Document, ops: readonly CallerOperation[]): Step {
  let current = doc;
  const inverses: Inverse[] = [];
  for (const op of ops) {
    const result = apply(current, op);
    if (!result.ok) throw new Error(`fixture op rejected: ${result.error.kind}`);
    current = result.value.document;
    inverses.push(result.value.inverse);
  }
  return { document: current, inverses };
}

/** Types `a` at 0 at t=0 and returns the stack and document, then a second insert at `at` at `ms`. */
function typeTwo(at: number, second: string, ms: number, origin: Origin = "HUM") {
  const first = run(startDoc(), [insert(0, "a")]);
  const stack1 = pushEdit([], first.inverses, [insert(0, "a")], 0);
  const op2 = insert(at, second, origin);
  const next = run(first.document, [op2]);
  return pushEdit(stack1, next.inverses, [op2], ms);
}

describe("pushEdit coalescing (Requirements 8.3, 8.4)", () => {
  it("coalesces a one-character HUM insert at the mark within 1000 ms", () => {
    const stack = typeTwo(1, "b", 1000);
    expect(stack).toHaveLength(1);
    expect(stack[0]?.group).toHaveLength(2);
    expect(stack[0]?.typing).toEqual({ endOffset: 2, atMs: 1000 });
  });

  it("starts a new group at 1001 ms", () => {
    expect(typeTwo(1, "b", 1001)).toHaveLength(2);
  });

  it("starts a new group when the Offset is not the mark's end", () => {
    expect(typeTwo(0, "b", 10)).toHaveLength(2);
  });

  it("starts a new group for a non-HUM origin", () => {
    const stack = typeTwo(1, "b", 10, "PST");
    expect(stack).toHaveLength(2);
    expect(stack[1]?.typing).toBeNull();
  });

  it("starts a new group for two code points", () => {
    const stack = typeTwo(1, "bc", 10);
    expect(stack).toHaveLength(2);
    expect(stack[1]?.typing).toBeNull();
  });

  it("treats a surrogate pair as one code point", () => {
    const stack = typeTwo(1, "😀", 10);
    expect(stack).toHaveLength(1);
    expect(stack[0]?.typing?.endOffset).toBe(3);
  });

  it("starts a new group when the top entry has no typing mark", () => {
    const base = run(startDoc(), [insert(0, "ab", "PST")]);
    const stack1 = pushEdit([], base.inverses, [insert(0, "ab", "PST")], 0);
    const op = insert(2, "c");
    const next = run(base.document, [op]);
    const stack2 = pushEdit(stack1, next.inverses, [op], 5);
    expect(stack2).toHaveLength(2);
    expect(stack2[1]?.typing).toEqual({ endOffset: 3, atMs: 5 });
  });

  it("leaves the stack unchanged when no Inverses were produced", () => {
    const stack = typeTwo(1, "b", 10);
    expect(pushEdit(stack, [], [insert(0, "x")], 20)).toBe(stack);
  });
});

describe("runUndo and runRedo (Requirements 8.5, 8.6, 8.9)", () => {
  const ops = [insert(0, "ab"), insert(2, "cd", "PST")];
  const edited = run(startDoc(), ops);
  const entry: UndoEntry = { group: edited.inverses, typing: null };

  it("undoes in reverse order and returns a chronological redo group", () => {
    const undone = runUndo(edited.document, entry);
    if (!undone.ok) throw new Error(undone.error.kind);
    expect(undone.value.document).toEqual(startDoc());
    const redone = runRedo(undone.value.document, { group: undone.value.produced, typing: null });
    if (!redone.ok) throw new Error(redone.error.kind);
    expect(redone.value.document).toEqual(edited.document);
    expect(redone.value.produced).toHaveLength(2);
  });

  it("returns the caret after the last applied Inverse's restored text", () => {
    const deleted = run(startDoc("hello"), [{ kind: "delete", from: 1, to: 3, actor: "HUM" }]);
    const undone = runUndo(deleted.document, { group: deleted.inverses, typing: null });
    if (!undone.ok) throw new Error(undone.error.kind);
    expect(undone.value.document.text).toBe("hello");
    expect(undone.value.caret).toBe(3);
  });

  it("returns stale_inverse for a Document the Inverse does not expect", () => {
    const other = startDoc("zzz");
    const undone = runUndo(other, entry);
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.error.kind).toBe("stale_inverse");
    const redone = runRedo(other, entry);
    expect(redone.ok).toBe(false);
  });
});
