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
