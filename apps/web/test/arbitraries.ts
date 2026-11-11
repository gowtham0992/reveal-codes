import * as fc from "fast-check";
import { apply, createDocument } from "@reveal-codes/engine";
import { PANE_ALLOWED, PRINT_COLOUR_VALUES, TOKEN_VALUES } from "./static/css-colours";
import type { CallerOperation, Document, VerificationResult } from "@reveal-codes/engine";
import { arbCreatedDocument, arbDocument } from "../../../packages/engine/src/testing/arb-document";
import { arbBoundary, arbOpSequence } from "../../../packages/engine/src/testing/arb-ops";
import { arbText, arbTimestamp } from "../../../packages/engine/src/testing/arb-text";
import { arbOpinionWithQuotes } from "../../../packages/engine/src/testing/arb-opinion";
import { arbProseWords } from "../../../packages/engine/src/testing/arb-quote-parts";
import { arbTextWithCitations } from "../../../packages/engine/src/testing/arb-text-citations";
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

/** Property 4 branch: a fresh Document over text built from the characters the Codes syntax escapes. */
const arbEscapeHeavyDocument: fc.Arbitrary<Document> = fc
  .array(fc.constantFrom("[", "]", "\\", "a", " ", "\n", "😀"), { maxLength: 30 })
  .map((chars) => {
    const created = createDocument(chars.join(""), "2024-01-01T00:00:00.000Z");
    if (!created.ok) throw new Error(`createDocument failed: ${created.error.kind}`);
    return created.value;
  });

/** Property 4 input: the Engine's `arbDocument` (weight 3) and escape-heavy fresh Documents (weight 1). */
export const arbLayoutDocument: fc.Arbitrary<Document> = fc.oneof(
  { arbitrary: arbDocument, weight: 3 },
  { arbitrary: arbEscapeHeavyDocument, weight: 1 },
);

/** Property 5 input: citations, quotes and short forms from the Engine, then long prose appended. */
export const arbCitingDocument: fc.Arbitrary<Document> = fc
  .tuple(
    arbTextWithCitations.map((t) => t.text),
    fc.array(arbProseWords, { minLength: 3, maxLength: 40 }),
  )
  .map(([cited, prose]) => `${cited} ${prose.join(" ")}`)
  .map((text) => createDocument(text, "2024-01-01T00:00:00.000Z"))
  .filter((r) => r.ok && r.value.citations.some((c) => c.kind === "full"))
  .map((r) => {
    if (!r.ok) throw new Error(`createDocument failed: ${r.error.kind}`);
    return r.value;
  });

/** Cluster ids come from a small pool so quotes of different citations share clusters. */
export const CLUSTER_POOL: readonly string[] = ["101", "102", "103"];

/** What the fake server answers: one result per posted record, one opinion per pooled cluster. */
export type VerifyScript = Readonly<{
  results: readonly VerificationResult[];
  /** Opinion text per `CLUSTER_POOL` entry; null is "unavailable". */
  opinions: readonly (string | null)[];
  /** Whether each opinion also embeds the Document's quotes, so some quotes match. */
  embedQuotes: boolean;
}>;

const arbScriptResult: fc.Arbitrary<VerificationResult> = fc.oneof(
  {
    arbitrary: fc
      .constantFrom(...CLUSTER_POOL)
      .map((clusterId) => ({ status: "verified" as const, clusterId })),
    weight: 4,
  },
  { arbitrary: fc.constant({ status: "not_found" as const }), weight: 1 },
  { arbitrary: fc.constant({ status: "unchecked" as const }), weight: 1 },
  {
    arbitrary: fc.constant({ status: "ambiguous" as const, candidates: ["101", "102"] }),
    weight: 1,
  },
);

export const arbVerifyScript: fc.Arbitrary<VerifyScript> = fc.record({
  results: fc.array(arbScriptResult, { minLength: 1, maxLength: 8 }),
  opinions: fc.tuple(
    ...CLUSTER_POOL.map(() =>
      fc.option(
        arbOpinionWithQuotes.map((o) => o.text),
        { nil: null },
      ),
    ),
  ),
  embedQuotes: fc.boolean(),
});

/** A count that is often zero and otherwise up to 50. */
const arbCount: fc.Arbitrary<number> = fc.oneof(fc.constant(0), fc.nat({ max: 50 }));

/** The parts of a NextStepInput, with the counts the sum is built from. */
export type NextStepCase = Readonly<{
  empty: boolean;
  verifying: boolean;
  uncheckedCitations: number;
  uncheckedQuotations: number;
  blocking: number;
  /** The sum of the citation and quotation counts. */
  verifiableUnchecked: number;
}>;

// Feature: first-run-and-flow, Property 1: one next step
export const arbNextStepInput: fc.Arbitrary<NextStepCase> = fc
  .record({
    empty: fc.boolean(),
    verifying: fc.boolean(),
    uncheckedCitations: arbCount,
    uncheckedQuotations: arbCount,
    blocking: arbCount,
  })
  .map((r) => ({ ...r, verifiableUnchecked: r.uncheckedCitations + r.uncheckedQuotations }));

/** A non-empty subset of the given stylesheet paths. */
// Feature: legal-record-ui, Property 1: tokens are total
export const arbStylesheetSubset = (paths: readonly string[]): fc.Arbitrary<string[]> =>
  fc.subarray([...paths], { minLength: 1 });

const STRAY_NAMED = ["red", "blue", "green", "gold", "navy", "tomato", "teal", "coral"] as const;
const KNOWN_HEX: ReadonlySet<string> = new Set([
  ...Object.values(TOKEN_VALUES),
  ...Object.values(PRINT_COLOUR_VALUES),
  ...PANE_ALLOWED,
]);

/** A stray colour: a six-digit hex outside the Token and Pane lists, an `rgba(...)`, or a named colour. */
// Feature: legal-record-ui, Property 1: tokens are total
export const arbStrayColour = (): fc.Arbitrary<string> =>
  fc.oneof(
    fc
      .array(
        fc.constantFrom(
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
        ),
        { minLength: 6, maxLength: 6 },
      )
      .map((h) => `#${h.join("")}`)
      .filter((h) => !KNOWN_HEX.has(h)),
    fc
      .tuple(fc.nat(255), fc.nat(255), fc.nat(255), fc.constantFrom(0.1, 0.5, 1))
      .map(([r, g, b, a]) => `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(a)})`),
    fc.constantFrom(...STRAY_NAMED),
  );
