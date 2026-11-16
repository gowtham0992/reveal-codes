/**
 * Arbitraries for the pasted-text-declaration spec (Req 11.6): Tool_Names
 * (valid and invalid), Declarations, mixed-origin Documents, and edit, undo
 * and redo sequences. `arbOrderChoice` is in
 * `packages/export/test/support/arbitraries.ts`, because it needs `OrderEntry`
 * and the engine must not import from the export package.
 * Built only from fast-check combinators, so values shrink.
 */
import fc from "fast-check";
import type { Declaration, DeclarationSubject } from "../declaration.js";
import { apply, createDocument } from "../document.js";
import type { CallerOperation, Document, Inverse, Origin } from "../types.js";
import { arbOp, RUN_ID_POOL } from "./arb-ops.js";
import { arbTimestamp } from "./arb-text.js";

/** Pieces of a valid Tool_Name; the emoji is one surrogate pair (2 code units). */
const NAME_PIECES: readonly string[] = [
  ..."abcXYZ019".split(""),
  ..."()[]{}\"';=,\\".split(""),
  " ",
  " ",
  "é",
  "ü",
  "ñ",
  "日本",
  "語",
  "\u{1F600}",
];

/** Cuts `s` to at most `max` code units without splitting a surrogate pair. */
function cutUnits(s: string, max: number): string {
  if (s.length <= max) return s;
  const last = s.charCodeAt(max - 1);
  return s.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/** Trims, cuts to 100 code units and trims again; pads to at least 2 code units. */
function fitName(raw: string): string {
  const cut = cutUnits(raw.trim(), 100).trimEnd();
  return cut.length >= 2 ? cut : `${cut}ok`;
}

/**
 * Valid Tool_Names: already trimmed, 2 to 100 UTF-16 code units, with
 * `()[]{}"';=,\`, inner spaces, accents, CJK and an emoji pair.
 */
export const arbToolName: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...NAME_PIECES), { minLength: 1, maxLength: 100 })
  .map((pieces) => fitName(pieces.join("")));

const arbNameChar: fc.Arbitrary<string> = fc.constantFrom("a", "Z", "7", "é", "語");

/** Why each kind is bad, in `checkToolName`'s fault order. */
const arbWhitespaceOnly: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\u00a0", "\u3000"), { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(""));

const arbWithControl: fc.Arbitrary<string> = fc
  .constantFrom("\n", "\r", "\t", "\u0000", "\u2028")
  .map((c) => `Chat${c}GPT`);

const arbWithLoneSurrogate: fc.Arbitrary<string> = fc
  .constantFrom("\ud800", "\udbff", "\udc00", "\udfff")
  .map((c) => `Chat${c}GPT`);

/**
 * Invalid Tool_Names: empty, one character, 101 characters, whitespace only,
 * a control character (`\n`, `\r`, `\t`, U+0000, U+2028), a lone surrogate.
 */
export const arbBadToolName: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  arbNameChar,
  arbNameChar.map((c) => c.repeat(101)),
  arbWhitespaceOnly,
  arbWithControl,
  arbWithLoneSurrogate,
);

const SUBJECTS: readonly DeclarationSubject[] = ["pasted_text", "this_filing"];

/** A stored Declaration: None or Declared_AI with a valid Tool_Name; any subject unless given. */
export function arbDeclaration(subject?: DeclarationSubject): fc.Arbitrary<Declaration> {
  const subjects = subject === undefined ? fc.constantFrom(...SUBJECTS) : fc.constant(subject);
  return fc.oneof(
    subjects.map((s): Declaration => ({ subject: s, choice: "none" })),
    fc
      .tuple(subjects, arbToolName)
      .map(([s, toolName]): Declaration => ({ subject: s, choice: "declared_ai", toolName })),
  );
}

// ---- Mixed-origin Documents -------------------------------------------------

type SegmentKind = Origin | "PST_BLANK";

const WORDS = ["alpha", "beta", "gamma", "delta", "motion", "court", "filed"] as const;
const arbWords: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...WORDS), { minLength: 4, maxLength: 8 })
  .map((ws) => ` ${ws.join(" ")}`);
const arbBlank: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\n", "\t", "\u0085", "\u2003"), { minLength: 1, maxLength: 4 })
  .map((cs) => cs.join(""));

/** The one Run_Id that is edited and relabelled; plain `AI` segments never use it. */
const EDITED_RUN = "rH";

const ALL_KINDS: readonly SegmentKind[] = ["HUM", "PST", "AI", "AI>HUM", "PST_BLANK"];

/** Appends one segment of `kind` to `doc`; AI>HUM is an AI run edited past the threshold. */
function appendSegment(
  doc: Document,
  kind: SegmentKind,
  text: string,
  runId: string,
  timestamp: string,
): Document {
  const at = doc.text.length;
  const isAi = kind === "AI" || kind === "AI>HUM";
  const origin: Origin = kind === "PST_BLANK" ? "PST" : kind === "AI>HUM" ? "AI" : kind;
  const provenance = isAi
    ? { origin, runId: kind === "AI>HUM" ? EDITED_RUN : runId, timestamp }
    : { origin, timestamp };
  const inserted = apply(doc, { kind: "insert", at, text, provenance });
  if (!inserted.ok) return doc;
  if (kind !== "AI>HUM") return inserted.value.document;
  const edit: CallerOperation = {
    kind: "replace",
    from: at + 1,
    to: at + 4,
    text: "zzz",
    provenance: { origin: "HUM", timestamp },
  };
  const edited = apply(inserted.value.document, edit, { relabelThreshold: 0.05 });
  return edited.ok ? edited.value.document : inserted.value.document;
}

type Plan = readonly (readonly [SegmentKind, string, string])[];

function build(timestamp: string, plan: Plan): Document | null {
  const start = createDocument("", timestamp);
  if (!start.ok) return null;
  return plan.reduce(
    (d, [k, text, runId]) => appendSegment(d, k, text, runId, timestamp),
    start.value,
  );
}

const arbSegment: fc.Arbitrary<readonly [SegmentKind, string, string]> = fc
  .tuple(fc.constantFrom(...ALL_KINDS), arbWords, arbBlank, fc.constantFrom(...RUN_ID_POOL))
  .map(([k, words, blank, runId]) => [k, k === "PST_BLANK" ? blank : words, runId] as const);

/**
 * Documents holding all four origins (`HUM`, `PST`, `AI`, `AI>HUM`), in
 * random order with extra segments, and often a whitespace-only `PST` span.
 * Built through `createDocument` and `apply` only.
 */
export const arbMixedOriginDocument: fc.Arbitrary<Document> = fc
  .tuple(
    arbTimestamp,
    fc.shuffledSubarray(["HUM", "PST", "AI", "AI>HUM"] as const, { minLength: 4, maxLength: 4 }),
    fc.array(arbSegment, { maxLength: 5 }),
    fc.array(arbSegment, { maxLength: 3 }),
  )
  .map(([ts, required, extras, tail]) => {
    const base = required.map((k): readonly [SegmentKind, string, string] => [
      k,
      " base text",
      "r1",
    ]);
    const blank: readonly [SegmentKind, string, string] = ["PST_BLANK", " ", "r1"];
    return build(ts, [...base, ...extras, ...(tail.length % 2 === 0 ? [blank] : []), ...tail]);
  })
  .filter((d): d is Document => d !== null);

// ---- Edit, undo and redo sequences -----------------------------------------

/** One step of an edit history: a Caller_Operation, an undo, or a redo. */
export type EditStep =
  | Readonly<{ kind: "edit"; op: CallerOperation }>
  | Readonly<{ kind: "undo" }>
  | Readonly<{ kind: "redo" }>;

type History = Readonly<{ doc: Document; undo: readonly Inverse[]; redo: readonly Inverse[] }>;

/** The history after `step`; an undo or redo with an empty stack changes nothing. */
function advance(h: History, step: EditStep): History {
  if (step.kind === "edit") {
    const r = apply(h.doc, step.op);
    return r.ok ? { doc: r.value.document, undo: [...h.undo, r.value.inverse], redo: [] } : h;
  }
  const from = step.kind === "undo" ? h.undo : h.redo;
  const inverse = from[from.length - 1];
  if (inverse === undefined) return h;
  const r = apply(h.doc, inverse);
  if (!r.ok) return h;
  const rest = from.slice(0, -1);
  return step.kind === "undo"
    ? { doc: r.value.document, undo: rest, redo: [...h.redo, r.value.inverse] }
    : { doc: r.value.document, undo: [...h.undo, r.value.inverse], redo: rest };
}

function arbNextStep(h: History): fc.Arbitrary<EditStep> {
  const edit = arbOp(h.doc).map((op): EditStep => ({ kind: "edit", op }));
  const options: fc.WeightedArbitrary<EditStep>[] = [{ arbitrary: edit, weight: 5 }];
  if (h.undo.length > 0) options.push({ arbitrary: fc.constant({ kind: "undo" }), weight: 3 });
  if (h.redo.length > 0) options.push({ arbitrary: fc.constant({ kind: "redo" }), weight: 3 });
  return fc.oneof(...options);
}

function arbSteps(h: History, n: number): fc.Arbitrary<readonly EditStep[]> {
  if (n === 0) return fc.constant([]);
  return arbNextStep(h).chain((step) =>
    arbSteps(advance(h, step), n - 1).map((rest) => [step, ...rest]),
  );
}

/**
 * 0 to 12 steps of edit (insert, delete or replace over `HUM`, `PST` and
 * `AI`), undo and redo against `doc`. Undo and redo are drawn only when
 * their stack is non-empty, so every step does something. An edit after an
 * undo discards the redo stack, as the editor does.
 */
export function arbEditSequence(doc: Document): fc.Arbitrary<readonly EditStep[]> {
  return fc.integer({ min: 0, max: 12 }).chain((n) => arbSteps({ doc, undo: [], redo: [] }, n));
}
