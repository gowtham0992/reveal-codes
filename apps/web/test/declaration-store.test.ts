// Task 12.3: Store clearing, the this_filing applicability, and persistence of the Declaration.
import { apply, createDocument, declareAi, declareNone, render } from "@reveal-codes/engine";
import type { CallerOperation, Declaration, Document } from "@reveal-codes/engine";
import {
  applicableDeclaration,
  declarationRequired,
  ORDERS,
  orderRequiresStatement,
} from "@reveal-codes/export";
import type { OrderEntry } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { initialState, reduce } from "../src/store";
import type { StoreAction, StoreState } from "../src/store";
import { deserialise, serialise } from "../src/persist";
import { createManualClock } from "./support/clock";
import { humanDocument } from "./support/order-fixtures";

const ISO = "2026-01-01T00:00:00.000Z";
const clock = createManualClock();
const now = clock.now;

function must<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string } }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${r.error.kind}`);
  return r.value;
}

function pastedDoc(text: string): Document {
  const op: CallerOperation = {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "PST", timestamp: ISO },
  };
  return must(apply(must(createDocument("", ISO)), op)).document;
}

function declaration(subject: "pasted_text" | "this_filing"): Declaration {
  const made = declareAi(subject, "ChatGPT (GPT-4o)");
  if (!made.ok) throw new Error(`fixture rejected: ${made.error}`);
  return made.value;
}

function stateWith(document: Document, stored: Declaration | null): StoreState {
  return { ...initialState(now), document, declaration: stored };
}

function step(state: StoreState, action: StoreAction): StoreState {
  clock.advance(5000);
  return reduce(state, action, now).state;
}

const PASTED = "The movant relies on the cited authority.";

describe("Declaration clearing in the Store _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 12.8_", () => {
  it("a paste clears a stored Declaration", () => {
    const start = stateWith(pastedDoc(PASTED), declaration("pasted_text"));
    const op: CallerOperation = {
      kind: "insert",
      at: 0,
      text: "More pasted words. ",
      provenance: { origin: "PST", timestamp: ISO },
    };
    expect(step(start, { type: "edit", ops: [op] }).declaration).toBeNull();
  });

  it("typing keeps a stored Declaration", () => {
    const stored = declaration("pasted_text");
    const op: CallerOperation = {
      kind: "insert",
      at: 0,
      text: "Typed. ",
      provenance: { origin: "HUM", timestamp: ISO },
    };
    const next = step(stateWith(pastedDoc(PASTED), stored), { type: "edit", ops: [op] });
    expect(next.declaration).toEqual(stored);
  });

  it("loading a sample (a replace with no Declaration) clears it", () => {
    const start = stateWith(pastedDoc(PASTED), declaration("pasted_text"));
    const next = step(start, { type: "replace", document: pastedDoc("A sample motion.") });
    expect(next.declaration).toBeNull();
  });

  it("starting a new document discards it", () => {
    const start = stateWith(pastedDoc(PASTED), declaration("pasted_text"));
    const next = step(start, { type: "replace", document: must(createDocument("", ISO)) });
    expect(next.declaration).toBeNull();
    expect(next.document.text).toBe("");
  });

  it("a partial delete of the pasted text keeps it", () => {
    const stored = declaration("pasted_text");
    const del: CallerOperation = { kind: "delete", from: 0, to: 10, actor: "HUM" };
    const next = step(stateWith(pastedDoc(PASTED), stored), { type: "edit", ops: [del] });
    expect(next.document.text).toBe(PASTED.slice(10));
    expect(next.declaration).toEqual(stored);
  });

  it("deleting all substantive pasted text drops it", () => {
    const del: CallerOperation = { kind: "delete", from: 0, to: PASTED.length, actor: "HUM" };
    const start = stateWith(pastedDoc(PASTED), declaration("pasted_text"));
    expect(step(start, { type: "edit", ops: [del] }).declaration).toBeNull();
  });
});

function statementOrder(): OrderEntry {
  const entry = ORDERS.entries.find(orderRequiresStatement);
  if (entry === undefined) throw new Error("no order requires a statement");
  return entry;
}

describe("a this_filing answer follows the order _Requirements: 5.9_", () => {
  it("is kept but not applied when the order stops requiring a statement, and applies again", () => {
    const doc = humanDocument();
    const stored = declareNone("this_filing");
    const order = statementOrder();
    expect(applicableDeclaration(doc, order, stored)).toEqual(stored);
    expect(declarationRequired(doc, order, stored)).toBe(false);

    expect(applicableDeclaration(doc, null, stored)).toBeNull();
    expect(declarationRequired(doc, null, stored)).toBe(false);

    expect(applicableDeclaration(doc, order, stored)).toEqual(stored);
  });

  it("an edit that keeps typed-only text leaves the stored value in the Store", () => {
    const stored = declareNone("this_filing");
    const op: CallerOperation = {
      kind: "insert",
      at: 0,
      text: "Typed. ",
      provenance: { origin: "HUM", timestamp: ISO },
    };
    const next = step(stateWith(humanDocument(), stored), { type: "edit", ops: [op] });
    expect(next.declaration).toEqual(stored);
  });
});

describe("draft written before this feature _Requirements: 5.10, 5.11_", () => {
  const rawOf = (doc: Document, extra: Record<string, unknown>): string =>
    JSON.stringify({ version: 1, codes: render(doc, "full").text, runLog: [], ...extra });

  it("with substantive pasted text loads unchanged and asks again", () => {
    const doc = pastedDoc(PASTED);
    const back = deserialise(rawOf(doc, {}));
    if (!back.ok) throw new Error(`load failed: ${back.error.kind}`);
    expect(back.value.document).toEqual(doc);
    expect(back.value.declaration).toBeNull();
    expect(declarationRequired(back.value.document, null, back.value.declaration)).toBe(true);
  });

  it("an unreadable declaration key asks again and the draft loads unchanged", () => {
    const doc = pastedDoc(PASTED);
    const back = deserialise(rawOf(doc, { declaration: { subject: "pasted_text" } }));
    if (!back.ok) throw new Error(`load failed: ${back.error.kind}`);
    expect(back.value.document).toEqual(doc);
    expect(back.value.declaration).toBeNull();
    expect(declarationRequired(back.value.document, null, back.value.declaration)).toBe(true);
  });

  it("a stored Declaration survives serialise and deserialise at version 1 and satisfies the ask", () => {
    const doc = pastedDoc(PASTED);
    const stored = declaration("pasted_text");
    const raw = serialise(doc, [], null, stored);
    expect((JSON.parse(raw) as { version: number }).version).toBe(1);
    const back = deserialise(raw);
    if (!back.ok) throw new Error(`load failed: ${back.error.kind}`);
    expect(back.value.declaration).toEqual(stored);
    expect(declarationRequired(back.value.document, null, back.value.declaration)).toBe(false);
  });
});
