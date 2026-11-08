import * as fc from "fast-check";
import { apply } from "@reveal-codes/engine";
import type { CallerOperation, Document } from "@reveal-codes/engine";
import { arbCreatedDocument } from "../../../packages/engine/src/testing/arb-document";
import { arbBoundary, arbOpSequence } from "../../../packages/engine/src/testing/arb-ops";
import { arbText, arbTimestamp } from "../../../packages/engine/src/testing/arb-text";
import { docFromText } from "../src/editor/offsets";
import { editorSchema } from "../src/editor/schema";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { StepDescriptor } from "./support/pm";

/** Characters that matter to the Codes syntax, mixed with the Engine's text. */
const bracketLine: fc.Arbitrary<string> = fc
  .array(fc.constantFrom("[", "]", "\\", "a", " ", "/", "?"), { maxLength: 20 })
  .map((items) => items.join(""));

const engineLine: fc.Arbitrary<string> = arbText.map((t) => t.replaceAll("\n", ""));

/** A Paragraph_List: the lines and the document `docFromText` builds from them. */
export type ParagraphList = Readonly<{ lines: readonly string[]; doc: PMNode }>;

/** One to six lines without `\n`, built into a document by `docFromText`. */
export const arbParagraphList: fc.Arbitrary<ParagraphList> = fc
  .array(fc.oneof(engineLine, bracketLine), { minLength: 1, maxLength: 6 })
  .map((lines) => ({ lines, doc: docFromText(editorSchema, lines.join("\n")) }));

/** An edit-plan transaction: one to three step descriptors and the provenance supplied. */
export type TransactionPlan = Readonly<{
  steps: readonly StepDescriptor[];
  provenance: Readonly<{ origin: "HUM" | "PST"; timestamp: string }>;
}>;

/** A start list and one to six transaction plans (Property 2). */
export type EditPlan = Readonly<{
  lines: readonly string[];
  transactions: readonly TransactionPlan[];
}>;

const arbIndex: fc.Arbitrary<number> = fc.integer({ min: 0, max: 1_000_000 });
const arbInserted: fc.Arbitrary<string> = fc.oneof(engineLine, bracketLine);
const arbPasted: fc.Arbitrary<string> = fc
  .array(fc.oneof(engineLine, bracketLine), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join("\n"));

/** One step descriptor; indices are unbounded and reduced by `test/support/pm.ts`. */
export const arbStepDescriptor: fc.Arbitrary<StepDescriptor> = fc.oneof(
  fc.record({ kind: fc.constant("insert" as const), at: arbIndex, text: arbInserted }),
  fc.record({ kind: fc.constant("delete" as const), from: arbIndex, to: arbIndex }),
  fc.record({
    kind: fc.constant("replace" as const),
    from: arbIndex,
    to: arbIndex,
    text: arbInserted,
  }),
  fc.record({ kind: fc.constant("split" as const), at: arbIndex }),
  fc.record({ kind: fc.constant("join" as const), which: arbIndex }),
  fc.record({
    kind: fc.constant("paste" as const),
    from: arbIndex,
    to: arbIndex,
    text: arbPasted,
  }),
);

const arbTransactionPlan: fc.Arbitrary<TransactionPlan> = fc.record({
  steps: fc.array(arbStepDescriptor, { minLength: 1, maxLength: 3 }),
  provenance: fc.record({
    origin: fc.constantFrom("HUM" as const, "PST" as const),
    timestamp: fc
      .integer({ min: 0, max: 4_000_000_000_000 })
      .map((ms) => new Date(ms).toISOString()),
  }),
});

export const arbEditPlan: fc.Arbitrary<EditPlan> = fc.record({
  lines: fc.array(fc.oneof(engineLine, bracketLine), { minLength: 1, maxLength: 6 }),
  transactions: fc.array(arbTransactionPlan, { minLength: 1, maxLength: 6 }),
});

/** A history plan: a start Document, `edit` actions (1 to 3 ops each) and the clock before each. */
export type HistoryPlan = Readonly<{
  start: Document;
  actions: readonly (readonly CallerOperation[])[];
  /** Milliseconds to advance the manual clock before each action; 0 to 2 500. */
  gaps: readonly number[];
}>;

function applyAll(start: Document, ops: readonly CallerOperation[]): Document {
  let doc = start;
  for (const op of ops) {
    const r = apply(doc, op);
    if (r.ok) doc = r.value.document;
  }
  return doc;
}

const arbTypedChar: fc.Arbitrary<string> = fc.constantFrom("a", "b", " ", "é", "\n", "😀");

/** One-code-point HUM inserts at consecutive Offsets from a Valid_Boundary of `doc`. */
function arbTypingRun(doc: Document): fc.Arbitrary<readonly CallerOperation[]> {
  return fc
    .tuple(arbBoundary(doc), fc.array(arbTypedChar, { maxLength: 12 }), arbTimestamp)
    .map(([from, chars, timestamp]) => {
      let at = from;
      return chars.map((text): CallerOperation => {
        const op: CallerOperation = {
          kind: "insert",
          at,
          text,
          provenance: { origin: "HUM", timestamp },
        };
        at += text.length;
        return op;
      });
    });
}

/** Cuts `ops` into chunks of 1 to 3 operations, singles favoured so typing runs stay single. */
function arbPartition(
  ops: readonly CallerOperation[],
): fc.Arbitrary<readonly (readonly CallerOperation[])[]> {
  return fc
    .array(fc.constantFrom(1, 1, 1, 2, 3), { minLength: ops.length, maxLength: ops.length })
    .map((sizes) => {
      const out: CallerOperation[][] = [];
      let i = 0;
      for (const size of sizes) {
        if (i >= ops.length) break;
        out.push(ops.slice(i, i + size));
        i += size;
      }
      return out;
    });
}

/** Property 3 input: Engine ops, then a typing run, partitioned, with clock gaps of 0 to 2 500 ms. */
export const arbHistoryPlan: fc.Arbitrary<HistoryPlan> = arbCreatedDocument.chain((start) =>
  arbOpSequence(start).chain((ops) =>
    arbTypingRun(applyAll(start, ops)).chain((typing) =>
      arbPartition([...ops, ...typing]).chain((actions) =>
        fc
          .array(fc.oneof(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 2500 })), {
            minLength: actions.length,
            maxLength: actions.length,
          })
          .map((gaps) => ({ start, actions, gaps })),
      ),
    ),
  ),
);
