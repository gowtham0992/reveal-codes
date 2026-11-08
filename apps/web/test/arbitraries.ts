import * as fc from "fast-check";
import { arbText } from "../../../packages/engine/src/testing/arb-text";
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
