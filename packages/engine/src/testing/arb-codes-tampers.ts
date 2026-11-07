/**
 * Document-local semantic tampers (`arb-codes.ts`; Req 20.4, 22.1). Each
 * builder edits a Full_Rendering so it still lexes and decodes but breaks
 * exactly one Req 20.4 rule, and records that rule and the input index the
 * design assigns to it (A12 step 3). The expected values come from where the
 * edit lands, never from running `parse`. A builder returns `undefined` when
 * the tamper cannot apply to the document.
 *
 * `ref_payload` (`[REF{...}]`, see `arb-codes-citations.ts`) records
 * `bad_field`: the lexer reports a Payload_Section on a payload-less Code, so
 * it is not a `ref_code` tamper.
 */
import fc from "fast-check";
import {
  TS,
  closeOf,
  edited,
  insertEdit,
  keyOf,
  named,
  pick,
  replaceCode,
  stampOf,
  tamper,
  usableCuts,
} from "./arb-codes-scan.js";
import type { Builder, CodePiece, Scanned } from "./arb-codes-scan.js";

const SPAN_NAMES: ReadonlySet<string> = new Set(["HUM", "PST", "AI", "AI>HUM"]);

const spansOf = (s: Scanned): readonly CodePiece[] => s.codes.filter((c) => SPAN_NAMES.has(c.name));

/** Drop the first span Code: a gap at 0, reported at the next span Code (else 0). */
export const coverageDrop: Builder = (c) => {
  const [first, second] = spansOf(c.s);
  if (first === undefined) return undefined;
  const index = second === undefined ? 0 : second.start - first.text.length;
  return fc.constant(tamper("coverage_drop", "coverage", index, edited(c, replaceCode(first, ""))));
};

/** Repeat a span Code right after itself: the first copy is empty, reported at it. */
export const coverageEmpty: Builder = (c) => {
  const spans = spansOf(c.s);
  const docEnd = c.s.codes[0]?.end;
  if (spans.length === 0 && docEnd !== undefined) {
    // An empty Document has no span Code; a span over empty Text is empty too.
    const text = edited(c, insertEdit(docEnd, `[PST{t=${TS}}]`));
    return fc.constant(tamper("coverage_empty", "coverage", docEnd, text));
  }
  return pick(spans, (sp) =>
    tamper("coverage_empty", "coverage", sp.start, edited(c, insertEdit(sp.end, sp.text))),
  );
};

/** Split a span in two with an identical Code: Mergeable neighbours, reported at the copy. */
export const canonicalSplit: Builder = (c) => {
  const spans = spansOf(c.s);
  const cuts = usableCuts(c.s);
  const options = spans.flatMap((sp, i) => {
    const end = spans[i + 1]?.offset ?? c.s.textLength;
    const inside = cuts.filter((k) => k.offset > sp.offset && k.offset < end);
    return inside.length === 0 ? [] : [{ sp, inside }];
  });
  if (options.length === 0) return undefined;
  return fc
    .constantFrom(...options)
    .chain((o) =>
      fc
        .constantFrom(...o.inside)
        .map((k) =>
          tamper(
            "canonical_split",
            "canonical",
            k.index,
            edited(c, insertEdit(k.index, o.sp.text)),
          ),
        ),
    );
};

/** An `AI` Code with an empty Run_Id: decodes, fails the Req 2.5 shape. */
export const provenanceEmptyRun: Builder = (c) =>
  pick(spansOf(c.s), (sp) =>
    tamper(
      "provenance_empty_run",
      "provenance",
      sp.start,
      edited(c, replaceCode(sp, `[AI:{t=${stampOf(sp)}}]`)),
    ),
  );

const runSpans = (s: Scanned): readonly CodePiece[] =>
  s.codes.filter((x) => x.name === "AI" || x.name === "AI>HUM");

/** Turn `AI` into `AI>HUM` or back, so the span disagrees with its Run's flag. */
export const runFlip: Builder = (c) =>
  pick(runSpans(c.s), (sp) => {
    const flipped =
      sp.name === "AI"
        ? `[AI>HUM${sp.text.slice("[AI".length)}`
        : `[AI${sp.text.slice("[AI>HUM".length)}`;
    return tamper("run_flip", "run_invariant", sp.start, edited(c, replaceCode(sp, flipped)));
  });

/** A span whose Run_Id is in no Run table entry. */
export const runMissing: Builder = (c) =>
  pick(runSpans(c.s), (sp) =>
    tamper(
      "run_missing",
      "run_invariant",
      sp.start,
      edited(c, replaceCode(sp, `[${sp.name}:zz~{t=${stampOf(sp)}}]`)),
    ),
  );

/** One lone surrogate anywhere in the Text: the unit count becomes odd, so one is unpaired. */
export const surrogate: Builder = (c) => {
  // Cuts before the first span Code would leave the new character uncovered (a coverage fault).
  const floor = spansOf(c.s)[0]?.end;
  if (floor === undefined) return undefined;
  return pick(
    usableCuts(c.s).filter((k) => k.index >= floor),
    (k) => tamper("surrogate", "surrogate", 0, edited(c, insertEdit(k.index, "\uD800"))),
  );
};

/** A `[QUO ✘]` whose `p` is at least the quote's length (Req 17.3). */
export const quotePrefix: Builder = (c) => {
  const opens = named(c.s, "QUO ").flatMap((o) => {
    const close = closeOf(c.s, o, "/QUO");
    const key = keyOf(o);
    return close === undefined || key === undefined
      ? []
      : [{ o, key, len: close.offset - o.offset }];
  });
  if (opens.length === 0) return undefined;
  return fc
    .constantFrom(...opens)
    .chain(({ o, key, len }) =>
      fc
        .nat(4)
        .map((extra) =>
          tamper(
            "quote_prefix",
            "quote_prefix",
            o.start,
            edited(c, replaceCode(o, `[QUO ✘{k=${key};p=${String(len + extra)}}]`)),
          ),
        ),
    );
};
