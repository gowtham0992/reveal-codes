import * as fc from "fast-check";
import { apply, blockingIssues, recordOverride } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { arbDocument } from "../../../engine/src/testing/arb-document";
import { ORDERS } from "../../src/index.js";
import type { Meta, OrderContext, OrderEntry, RunInfo } from "../../src/index.js";

/**
 * Number of runs for every property test: `FC_NUM_RUNS` if set to a positive
 * integer, else 500 when `CI` is set, else 200. Same pattern as
 * `apps/web/test/support/fc.ts`.
 */
export function runs(env: Readonly<Record<string, string | undefined>> = process.env): number {
  const raw = env["FC_NUM_RUNS"];
  if (raw !== undefined && /^[1-9]\d*$/.test(raw)) return Number(raw);
  const ci = env["CI"];
  return ci !== undefined && ci !== "" ? 500 : 200;
}

const PROVIDERS = ["bedrock", "anthropic", "fixture"] as const;
const MODELS: readonly (string | null)[] = [null, "m-1", "m-2"];

/** One run-log entry for `runId`; small provider and model pools make duplicate pairs common. */
function arbEntry(runId: string): fc.Arbitrary<RunInfo> {
  return fc.record({
    runId: fc.constant(runId),
    provider: fc.constantFrom(...PROVIDERS),
    modelId: fc.constantFrom(...MODELS),
  });
}

/** Run logs for `doc`: zero to three entries per run in `doc.runs`, plus entries for unused runs. */
export function arbRunLog(doc: Document): fc.Arbitrary<readonly RunInfo[]> {
  const ids = [...doc.runs.map((r) => r.runId), "unused-1", "unused-2"];
  return fc
    .array(fc.constantFrom(...ids).chain(arbEntry), { maxLength: 8 })
    .map((entries) => entries);
}

const arbInstant: fc.Arbitrary<Date> = fc.date({
  min: new Date("2000-01-01T00:00:00.000Z"),
  max: new Date("2100-01-01T00:00:00.000Z"),
  noInvalidDate: true,
});

/** Valid metadata: `now` is a valid Date, `verifiedAt` is null or an ISO 8601 UTC instant. */
export const arbMeta: fc.Arbitrary<Meta> = fc.record({
  now: arbInstant,
  verifiedAt: fc.option(
    arbInstant.map((d) => d.toISOString()),
    { nil: null },
  ),
});

export type ExportCase = Readonly<{ document: Document; runLog: readonly RunInfo[]; meta: Meta }>;

/** A Document from the Engine's `arbDocument`, a run log for it, and valid metadata. */
export const arbExportCase: fc.Arbitrary<ExportCase> = arbDocument.chain((document) =>
  fc.record({
    document: fc.constant(document),
    runLog: arbRunLog(document),
    meta: arbMeta,
  }),
);

const OVERRIDE_AT = "2026-11-20T18:25:00.000Z";

/** `doc` with an Override recorded, through the Engine API, for every blocking issue. */
function overrideAll(doc: Document): Document {
  let current = doc;
  for (const issue of blockingIssues(doc)) {
    const next = recordOverride(current, issue.key, "reason", OVERRIDE_AT);
    if (!next.ok) throw new Error(`recordOverride failed: ${next.error.kind}`);
    current = next.value;
  }
  return current;
}

/** Documents with no blocking issue: `arbDocument` with every blocking issue overridden. */
export const arbGateClearDocument: fc.Arbitrary<Document> = arbDocument.map(overrideAll);

export type GateCase = Readonly<{ doc: Document; clear: boolean }>;

/** Either an arbitrary Document (`clear: false`) or the clear variant (`clear: true`). */
export const arbGateDocument: fc.Arbitrary<GateCase> = fc.oneof(
  arbDocument.map((doc): GateCase => ({ doc, clear: false })),
  arbGateClearDocument.map((doc): GateCase => ({ doc, clear: true })),
);

const SELECTABLE_ENTRIES: readonly OrderEntry[] = ORDERS.entries.filter(
  (e) => e.status === "current",
);

/** A current (selectable) entry of the shipped Order_Set. */
export const arbSelectableEntry: fc.Arbitrary<OrderEntry> = fc.constantFrom(...SELECTABLE_ENTRIES);

/** Any entry of the shipped Order_Set, of every status. */
export const arbAnyEntry: fc.Arbitrary<OrderEntry> = fc.constantFrom(...ORDERS.entries);

/** No order (null) or a selectable entry with the author's confidentiality tick. */
export const arbOrderContext: fc.Arbitrary<OrderContext> = fc.option(
  fc.record({ entry: arbSelectableEntry, confidentialityCertified: fc.boolean() }),
  { nil: null },
);

const AI_SENTENCES = [
  "The movant relies on the record.",
  "This motion should be granted.",
  "The facts are not in dispute.",
] as const;

/** `doc` with an AI-origin sentence appended through `apply`, or `doc` if a Blocking_Issue results. */
function appendAiSentence(doc: Document, sentence: string): Document {
  const op = {
    kind: "insert",
    at: doc.text.length,
    text: ` ${sentence}`,
    provenance: { origin: "AI", runId: "ai-run-1", timestamp: OVERRIDE_AT },
  } as const;
  const applied = apply(doc, op);
  if (!applied.ok) return doc;
  return blockingIssues(applied.value.document).length === 0 ? applied.value.document : doc;
}

/** Gate-clear documents; in half the cases an AI-origin sentence is appended (kept only if still clear). */
export const arbGateClearAiDocument: fc.Arbitrary<Document> = fc.oneof(
  arbGateClearDocument,
  fc
    .tuple(arbGateClearDocument, fc.constantFrom(...AI_SENTENCES))
    .map(([doc, sentence]) => appendAiSentence(doc, sentence)),
);

const entriesOf = (pick: (e: OrderEntry) => boolean): readonly OrderEntry[] =>
  SELECTABLE_ENTRIES.filter(pick);

/** One shipped entry per kind, plus the two shapes that require a statement. */
const CHOICE_GROUPS: readonly (readonly OrderEntry[])[] = [
  ...(
    [
      "certification_every_filing",
      "disclosure_when_used",
      "prohibition",
      "verification_only",
      "guidance",
    ] as const
  ).map((kind) => entriesOf((e) => e.kind === kind)),
  entriesOf((e) => e.kind === "certification_every_filing"),
  entriesOf((e) => e.elements.includes("negative_certification_when_unused")),
].filter((g) => g.length > 0);

/** `null` (no order) or an entry of each kind, including both statement-requiring shapes. */
export const arbOrderChoice: fc.Arbitrary<OrderEntry | null> = fc.oneof(
  fc.constant(null),
  ...CHOICE_GROUPS.map((g) => fc.constantFrom(...g)),
);

/**
 * Characters for Word paragraph text: letters, digits, spaces, tabs, quotation marks, `&`, `<`, `>`,
 * and non-ASCII characters (BMP and astral). None is `\n` or a character XML 1.0 cannot carry.
 */
const PARAGRAPH_CHARS: readonly string[] = [
  ..."abcXYZ019.,;:'()-".split(""),
  " ",
  " ",
  "\t",
  '"',
  "&",
  "<",
  ">",
  "\u201C",
  "\u201D",
  "\u00E9",
  "\u00DF",
  "\u2014",
  "\u00A7",
  "\u65E5",
  "\u{1F600}",
];

/** One paragraph: possibly empty, possibly with leading and trailing spaces or tabs. */
const arbParagraph: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...PARAGRAPH_CHARS), { maxLength: 24 })
  .map((chars) => chars.join(""));

/** Paragraph lists (one to six paragraphs) with no `\n` and no character XML 1.0 cannot carry. */
export const arbParagraphs: fc.Arbitrary<string[]> = fc.array(
  fc.oneof({ weight: 1, arbitrary: fc.constant("") }, { weight: 5, arbitrary: arbParagraph }),
  { minLength: 1, maxLength: 6 },
);

/** One single-character change to a body paragraph; `at` is a code point index. */
export type BodyEdit = Readonly<{
  paragraph: number;
  at: number;
  kind: "insert" | "replace" | "delete";
  char: string;
}>;

/**
 * A single-character change to one paragraph of `paragraphs` (which must hold at least one).
 * `replace` always picks a character different from the old one; `replace` and `delete` need a
 * non-empty paragraph, so an all-empty list gets only `insert`.
 */
export function arbBodyEdit(paragraphs: readonly string[]): fc.Arbitrary<BodyEdit> {
  const nonEmpty = paragraphs.flatMap((p, i) => (p.length > 0 ? [i] : []));
  const arbInsert = fc
    .tuple(fc.nat({ max: paragraphs.length - 1 }), fc.constantFrom(...PARAGRAPH_CHARS), fc.nat())
    .map(([paragraph, char, n]): BodyEdit => {
      const length = Array.from(paragraphs[paragraph] ?? "").length;
      return { paragraph, at: n % (length + 1), kind: "insert", char };
    });
  if (nonEmpty.length === 0) return arbInsert;
  const arbInside = fc
    .tuple(fc.constantFrom(...nonEmpty), fc.nat(), fc.constantFrom(...PARAGRAPH_CHARS))
    .map(([paragraph, n, char]) => {
      const chars = Array.from(paragraphs[paragraph] ?? "");
      return { paragraph, at: n % chars.length, char, old: chars[n % chars.length] ?? "" };
    });
  const arbReplace = arbInside.map(({ paragraph, at, char, old }): BodyEdit => ({
    paragraph,
    at,
    kind: "replace",
    char: char === old ? (old === "x" ? "y" : "x") : char,
  }));
  const arbDelete = arbInside.map(({ paragraph, at }): BodyEdit => ({
    paragraph,
    at,
    kind: "delete",
    char: "",
  }));
  return fc.oneof(arbInsert, arbReplace, arbDelete);
}

/** `paragraphs` with `edit` applied; the result differs from the input in exactly one character. */
export function applyBodyEdit(paragraphs: readonly string[], edit: BodyEdit): string[] {
  return paragraphs.map((p, i) => {
    if (i !== edit.paragraph) return p;
    const chars = Array.from(p);
    if (edit.kind === "insert") chars.splice(edit.at, 0, edit.char);
    else if (edit.kind === "replace") chars.splice(edit.at, 1, edit.char);
    else chars.splice(edit.at, 1);
    return chars.join("");
  });
}

const arbHostileToken: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(..."abcXYZ019 .,;:'\"&<>\n\t".split("")) },
  { weight: 1, arbitrary: fc.constantFrom("\u000B", "\u000C") },
  { weight: 2, arbitrary: fc.integer({ min: 0x00, max: 0x1f }).map((c) => String.fromCharCode(c)) },
  { weight: 1, arbitrary: fc.constantFrom("\uFFFE", "\uFFFF") },
  {
    weight: 2,
    arbitrary: fc.integer({ min: 0xd800, max: 0xdbff }).map((c) => String.fromCharCode(c)),
  },
  {
    weight: 2,
    arbitrary: fc.integer({ min: 0xdc00, max: 0xdfff }).map((c) => String.fromCharCode(c)),
  },
  { weight: 2, arbitrary: fc.constantFrom("\r\n", "\r") },
  { weight: 1, arbitrary: fc.constantFrom("\u{1F600}", "\u{10000}", "\u{10FFFF}", "\u{20000}") },
  { weight: 1, arbitrary: fc.constantFrom("\u00E9", "\u65E5", "\u201C") },
);

/** Strings built from tokens: ordinary characters mixed with every Docx_Unsafe_Character class. */
const arbHostileTokens: fc.Arbitrary<string> = fc
  .array(arbHostileToken, { maxLength: 40 })
  .map((tokens) => tokens.join(""));

/** Strings built from raw UTF-16 code units, so surrogates pair up or stay unpaired by chance. */
const arbHostileCodeUnits: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      fc.integer({ min: 0x00, max: 0x1f }),
      fc.integer({ min: 0x20, max: 0x7e }),
      fc.integer({ min: 0xd800, max: 0xdfff }),
      fc.constantFrom(0xfffe, 0xffff, 0xfffd, 0xe000),
      fc.integer({ min: 0x00, max: 0xffff }),
    ),
    { maxLength: 40 },
  )
  .map((units) => String.fromCharCode(...units));

/**
 * Text that may hold U+0000 to U+001F (U+000B and U+000C included), U+FFFE, U+FFFF, unpaired
 * surrogates, `\r\n`, lone `\r` and astral characters, drawn as tokens and as code-unit sequences.
 */
export const arbDocxHostileText: fc.Arbitrary<string> = fc.oneof(
  arbHostileTokens,
  arbHostileCodeUnits,
);
