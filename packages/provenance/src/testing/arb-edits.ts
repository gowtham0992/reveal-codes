/**
 * Pairs of related texts for the line difference (Req 16.14, task 4.5): a few
 * lines edited, inserted or deleted, edits at the start and end, deletion of
 * the whole text, and a rewrite past the Myers cap. Only `src/testing/` imports fast-check.
 */
import fc from "fast-check";
import { DIFF_CAP } from "../core/limits.js";
import { arbLine, arbLines } from "./arb-text.js";

/** An old text and a new text derived from it. */
export type TextPair = { old: string; new: string };

type LineEdit = { at: number; del: number; ins: string[] };

const arbEol = fc.constantFrom("\n", "\r\n");
const arbLineEdit: fc.Arbitrary<LineEdit> = fc.record({
  at: fc.nat({ max: 40 }),
  del: fc.integer({ min: 0, max: 3 }),
  ins: fc.array(arbLine, { maxLength: 3 }),
});

const terminate = (lines: readonly string[], eol: string, final: boolean): string[] =>
  lines.map((l, i) => (i < lines.length - 1 || final ? l + eol : l));

function applyEdit(lines: string[], e: LineEdit): string[] {
  const at = e.at % (lines.length + 1);
  return [...lines.slice(0, at), ...e.ins, ...lines.slice(at + e.del)];
}

/** A few line edits anywhere in a text, with or without a final newline. */
const arbFewEdits: fc.Arbitrary<TextPair> = fc
  .tuple(arbLines, fc.array(arbLineEdit, { minLength: 1, maxLength: 3 }), arbEol, fc.boolean())
  .map(([base, edits, eol, final]) => {
    const next = edits.reduce(applyEdit, base);
    return {
      old: terminate(base, eol, final).join(""),
      new: terminate(next, eol, final).join(""),
    };
  });

/** An edit at the start, or an insertion or deletion at the end. */
const arbEnds: fc.Arbitrary<TextPair> = fc
  .tuple(arbLines, arbLines, arbEol, fc.constantFrom("start", "end", "drop-start", "drop-end"))
  .map(([base, extra, eol, where]) => {
    const old = terminate(base, eol, true);
    const add = terminate(extra, eol, true);
    const next =
      where === "start"
        ? [...add, ...old]
        : where === "end"
          ? [...old, ...add]
          : where === "drop-start"
            ? old.slice(1)
            : old.slice(0, -1);
    return { old: old.join(""), new: next.join("") };
  });

/** The whole text deleted, or created from nothing. */
const arbWholeText: fc.Arbitrary<TextPair> = fc
  .tuple(arbLines, arbEol, fc.boolean())
  .map(([base, eol, reverse]) => {
    const text = terminate(base, eol, true).join("");
    return reverse ? { old: "", new: text } : { old: text, new: "" };
  });

/** Two texts with no line in common and more lines than the cap allows. */
const arbPastCap: fc.Arbitrary<TextPair> = fc
  .tuple(
    fc.integer({ min: DIFF_CAP + 1, max: DIFF_CAP + 40 }),
    fc.integer({ min: 1, max: 3 }),
    arbLine,
  )
  .map(([n, shift, tail]) => {
    const make = (tag: string): string =>
      Array.from({ length: n + shift }, (_, i) => `${tag}${String(i)}\n`).join("") + tail;
    return { old: make("a"), new: make("b") };
  });

/** Related text pairs of every shape the line difference must handle. */
export const arbTextPair: fc.Arbitrary<TextPair> = fc.oneof(
  { weight: 6, arbitrary: arbFewEdits },
  { weight: 3, arbitrary: arbEnds },
  { weight: 1, arbitrary: arbWholeText },
  { weight: 1, arbitrary: arbPastCap },
);
