/**
 * Histories and line edits over a small vocabulary of lines, so that equal lines recur
 * (Req 4.2, 4.17, 16.25, Property 18): shared line starts, indentation, CR LF, a bare CR,
 * surrogate pairs, blank lines, a last line with no line feed, and lines inserted together
 * with a copy of the lines just above them (the toKelvin shape: `}`, a blank line, then a
 * block that ends in `}` and a blank line). Only `src/testing/` imports fast-check.
 */
import fc from "fast-check";
import { createDocument, type Document } from "@reveal-codes/engine";
import { updateRecord } from "../core/update.js";
import { KNOWN_WINDOWS } from "./arb-edits.js";

const VOCABULARY: readonly string[] = [
  "",
  "}",
  "{",
  "// head",
  "// head two",
  "  keep line;",
  "  keep line two;",
  "    deeper;",
  "\tTabbed;",
  "const a = 1;",
  "const a = 2;",
  "x\u{1F600}y",
  "\u{1F600}",
  "bare\rcarriage",
];

/** One line of the vocabulary with its end: mostly `\n`, some `\r\n`, a few with none. */
const arbPiece: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(...VOCABULARY),
    fc.oneof(
      { weight: 8, arbitrary: fc.constant("\n") },
      { weight: 3, arbitrary: fc.constant("\r\n") },
      { weight: 1, arbitrary: fc.constant("") },
    ),
  )
  .map(([line, eol]) => line + eol);

type PieceEdit = {
  kind: "insert" | "delete" | "replace" | "duplicate" | "clear" | "block";
  at: number;
  count: number;
  pieces: string[];
};

const arbPieceEdit: fc.Arbitrary<PieceEdit> = fc.record({
  kind: fc.constantFrom(
    "insert",
    "insert",
    "delete",
    "replace",
    "replace",
    "duplicate",
    "clear",
    "block",
  ),
  at: fc.nat({ max: 40 }),
  count: fc.integer({ min: 1, max: 3 }),
  pieces: fc.array(arbPiece, { minLength: 1, maxLength: 3 }),
});

/** The lines of `text`: each piece ends after a line feed and includes it. */
export function pieces(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function applyPieceEdit(lines: readonly string[], e: PieceEdit): string[] {
  const at = e.at % (lines.length + 1);
  const head = lines.slice(0, at);
  const tail = lines.slice(at);
  switch (e.kind) {
    case "insert":
      return [...head, ...e.pieces, ...tail];
    case "delete":
      return [...head, ...tail.slice(e.count)];
    case "replace":
      return [...head, ...e.pieces, ...tail.slice(e.count)];
    case "duplicate":
      return [...head, ...tail.slice(0, e.count), ...tail];
    case "clear":
      return [];
    case "block":
      // The toKelvin shape (Req 4.17): new lines, then a copy of the lines just above.
      return [...head, ...e.pieces, ...head.slice(-e.count), ...tail];
  }
}

const arbEdits = fc.array(arbPieceEdit, { minLength: 1, maxLength: 4 });
const edited = (text: string, edits: readonly PieceEdit[]): string =>
  edits.reduce(applyPieceEdit, pieces(text)).join("");

/** A Record's history: a starting text and whole-file changes, by the agent in a window or outside it. */
export type LineHistory = {
  base: string;
  steps: { origin: "AI" | "HUM"; window: number; text: string }[];
};

/** A history over the vocabulary, the text it ends in, and the later change to record. */
export type LineCase = {
  history: LineHistory;
  newText: string;
  origin: "AI" | "HUM";
  window: number;
};

const arbStep = fc.record({
  origin: fc.constantFrom<"AI" | "HUM">("AI", "AI", "HUM"),
  window: fc.integer({ min: 0, max: 2 }),
  edits: arbEdits,
});

/** The Record text a history ends in. */
export function historyText(h: LineHistory): string {
  return h.steps[h.steps.length - 1]?.text ?? h.base;
}

/**
 * A history of one to three changes over the vocabulary (the base text may be empty) and a
 * later change made of one to four line edits (insert, delete, replace, duplicate, clear),
 * recorded by the agent or outside it.
 */
export const arbLineCase: fc.Arbitrary<LineCase> = fc
  .tuple(
    fc.array(arbPiece, { maxLength: 12 }),
    fc.array(arbStep, { minLength: 1, maxLength: 3 }),
    arbEdits,
    fc.constantFrom<"AI" | "HUM">("AI", "HUM"),
    fc.integer({ min: 0, max: 2 }),
  )
  .map(([baseLines, steps, last, origin, window]) => {
    const base = baseLines.join("");
    let text = base;
    const out = steps.map((s) => {
      text = edited(text, s.edits);
      return { origin: s.origin, window: s.window, text };
    });
    return { history: { base, steps: out }, newText: edited(text, last), origin, window };
  });

/** The Record a line history builds, through `createDocument` and `updateRecord` and the real Engine. */
export function buildLineRecord(h: LineHistory): Document {
  let tick = 0;
  const clock = { nowIso: () => new Date(Date.UTC(2026, 0, 1) + 1000 * tick++).toISOString() };
  const created = createDocument(h.base, "2026-01-01T00:00:00.000Z");
  if (!created.ok) throw new Error("createDocument failed");
  return h.steps.reduce((doc, s) => {
    const window = s.origin === "AI" ? (KNOWN_WINDOWS[s.window] ?? null) : null;
    const next = updateRecord(doc, s.text, s.origin, window, clock);
    if (!next.ok) throw new Error("updateRecord failed");
    return next.value;
  }, created.value);
}
