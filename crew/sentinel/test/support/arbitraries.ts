import fc from "fast-check";
import type { Finding, SweepReport } from "../../src/types.js";

const SPECIALS = ["|", "\n", "…", "\\", " "] as const;

/** Cell text that exercises the escaping and flattening rules. */
const arbText: fc.Arbitrary<string> = fc
  .array(fc.oneof(fc.constantFrom(...SPECIALS), fc.string({ maxLength: 4 })), { maxLength: 8 })
  .map((parts) => parts.join(""));

const arbLine: fc.Arbitrary<number | null> = fc.option(fc.integer({ min: 1, max: 9999 }), {
  nil: null,
});

const arbDriftKind = fc.constantFrom(
  "body_edited",
  "citation_changed",
  "quote_changed",
  "override_stale",
  "unreadable",
);

/** A Finding of any of the six kinds, belonging to `file`. */
export function arbFinding(file: string): fc.Arbitrary<Finding> {
  const base = fc.record({ line: arbLine, before: arbText, after: arbText });
  const drift = fc.tuple(arbDriftKind, base).map(([kind, b]): Finding => ({ kind, file, ...b }));
  const recheck = fc
    .tuple(base, fc.option(arbText, { nil: null }))
    .map(([b, waitUntil]): Finding => ({ kind: "recheck_unavailable", file, waitUntil, ...b }));
  return fc.oneof(drift, recheck);
}

/** A file name has no line feed; names are distinct under `localeCompare(b, "en")`. */
const arbFileName: fc.Arbitrary<string> = fc
  .string({ maxLength: 12 })
  .map((s) => s.replace(/[\r\n]/g, "_"));

const sameCollation = (a: string, b: string): boolean => a.localeCompare(b, "en") === 0;

/** Sweep_Reports with distinct file names in any order, both modes, any valid instant. */
export const arbSweepReport: fc.Arbitrary<SweepReport> = fc
  .tuple(
    fc.uniqueArray(arbFileName, { maxLength: 6, comparator: sameCollation }),
    fc.date({ noInvalidDate: true }),
    fc.constantFrom("fixtures", "live"),
  )
  .chain(([names, sweptAt, mode]) =>
    fc
      .tuple(
        ...names.map((file) =>
          fc.array(arbFinding(file), { maxLength: 4 }).map((findings) => ({ file, findings })),
        ),
      )
      .map((files) => ({ sweptAt, mode, files })),
  );

/** One character of a body line: ASCII, the ellipsis mark, or an astral character (two code units). */
const arbLineChar: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom("a", "b", "c", " ", ".", "e") },
  { weight: 1, arbitrary: fc.constant("…") },
  { weight: 2, arbitrary: fc.constantFrom("😀", "𝒳", "𠀀") },
);
const arbChars = (maxLength: number): fc.Arbitrary<string> =>
  fc.array(arbLineChar, { maxLength }).map((cs) => cs.join(""));

/**
 * Two different single-line strings built from a shared prefix and two tails, so that the
 * first difference falls both inside and beyond the first 80 code units. The prefix holds up
 * to 70 characters (up to 140 code units); the tails up to 60 characters each.
 */
export const arbLinePair: fc.Arbitrary<{ readonly b: string; readonly a: string }> = fc
  .tuple(arbChars(70), arbChars(60), arbChars(60))
  .filter(([, tailB, tailA]) => tailB !== tailA)
  .map(([prefix, tailB, tailA]) => ({ b: prefix + tailB, a: prefix + tailA }));
