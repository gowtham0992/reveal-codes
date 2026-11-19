// Baseline part filled in by task 4.10; tasks 4.12 and 5.8 add the directory parts.
import fc from "fast-check";
import type { Baseline, BaselineEntry } from "../core/types.js";
import { arbPath } from "./arb-text.js";

const HEX = "0123456789abcdef".split("");
const hexOf = (length: number): fc.Arbitrary<string> =>
  fc
    .array(fc.constantFrom(...HEX), { minLength: length, maxLength: length })
    .map((c) => c.join(""));

/** A SHA-256 digest: 64 lowercase hex characters. */
export const arbSha256: fc.Arbitrary<string> = hexOf(64);

/** A Blob_Id: 40 or 64 lowercase hex characters. */
export const arbBlobId: fc.Arbitrary<string> = fc.oneof(hexOf(40), hexOf(64));

/** A Baseline_Entry; `blob` is present for some entries and absent for others. */
export const arbBaselineEntry: fc.Arbitrary<BaselineEntry> = fc
  .tuple(arbSha256, fc.option(arbBlobId, { nil: undefined }))
  .map(([sha256, blob]) => (blob === undefined ? { sha256 } : { sha256, blob }));

/** Characters that stress JSON quoting and UTF-16 code unit order against code point order. */
const TAIL = fc.constantFrom('"', "\\", "\u{1F600}", "\u{10000}", "\uFF5E", "\uFFFF", "\u00e9");

/** A path from `arbPath`, often with one extra character that quotes or orders unusually. */
export const arbBaselinePath: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: arbPath },
  {
    weight: 1,
    arbitrary: fc.tuple(arbPath, TAIL).map(([path, tail]) => `${path}${tail}`),
  },
);

const two = (n: number): string => String(n).padStart(2, "0");

/** A valid `at`: an ISO 8601 UTC time with seconds, ending in `Z`. */
export const arbBaselineAt: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 0, max: 23 }),
    fc.integer({ min: 0, max: 59 }),
    fc.integer({ min: 0, max: 59 }),
  )
  .map(
    ([y, mo, d, h, mi, s]) => `${String(y)}-${two(mo)}-${two(d)}T${two(h)}:${two(mi)}:${two(s)}Z`,
  );

/** A set of Baseline_Entries as `[path, entry]` pairs with distinct paths, in one insertion order. */
const arbBaselinePairs: fc.Arbitrary<[string, BaselineEntry][]> = fc.uniqueArray(
  fc.tuple(arbBaselinePath, arbBaselineEntry),
  { maxLength: 8, selector: ([path]) => path },
);

const build = (at: string, pairs: readonly (readonly [string, BaselineEntry])[]): Baseline => ({
  version: 1,
  at,
  files: Object.fromEntries(pairs),
});

/** A Baseline of zero to eight files. */
export const arbBaseline: fc.Arbitrary<Baseline> = fc
  .tuple(arbBaselineAt, arbBaselinePairs)
  .map(([at, pairs]) => build(at, pairs));

/** Two Baselines holding the same set, built from the same pairs in two different insertion orders. */
export const arbBaselineTwoOrders: fc.Arbitrary<{ first: Baseline; second: Baseline }> = fc
  .tuple(arbBaselineAt, arbBaselinePairs)
  .chain(([at, pairs]) =>
    fc
      .shuffledSubarray(pairs, { minLength: pairs.length, maxLength: pairs.length })
      .map((shuffled) => ({ first: build(at, pairs), second: build(at, shuffled) })),
  );
