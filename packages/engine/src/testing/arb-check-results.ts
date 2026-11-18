/**
 * Arbitraries for check results (citation-check-page spec, Req 17.8): a
 * verification result per Full_Citation, a quote-check result per quotation,
 * and Display_Info per cluster. Documents and text come from `arb-document.ts`;
 * results come from `arb-state.ts`. The engine has no dependencies, so
 * `CheckDisplayInfo` repeats the shape of the verifier's `DisplayInfo`
 * structurally; it is assignable to it.
 */
import fc from "fast-check";
import {
  fullRecordsOf,
  applyStateWrites,
  arbQuoteCheckResult,
  arbVerificationResult,
} from "./arb-state.js";
import type { StateWrite } from "./arb-state.js";
import { arbDocument } from "./arb-document.js";
import type { Document, IssueKey, QuoteCheckResult, VerificationResult } from "../types.js";

/** The shape of the verifier's `DisplayInfo`: cluster id, case name and year on record, link path. */
export type CheckDisplayInfo = Readonly<{
  clusterId: string;
  foundName: string;
  foundYear?: number;
  absoluteUrl?: string;
}>;

const arbClusterId: fc.Arbitrary<string> = fc
  .integer({ min: 1, max: 99_999_999 })
  .map((n) => String(n));

const arbFoundName: fc.Arbitrary<string> = fc
  .tuple(fc.stringMatching(/^[A-Z][a-z]{2,9}$/), fc.stringMatching(/^[A-Z][a-z]{2,9}$/))
  .map(([a, b]) => `${a} v. ${b}`);

/** Display_Info for `clusterId`: a non-blank name, an optional year of at least 1000, an optional site-relative path. */
export function arbDisplayInfoFor(clusterId: string): fc.Arbitrary<CheckDisplayInfo> {
  return fc
    .record({
      foundName: arbFoundName,
      foundYear: fc.option(fc.integer({ min: 1790, max: 2026 }), { nil: undefined }),
      absoluteUrl: fc.option(
        arbClusterId.map((n) => `/opinion/${n}/x/`),
        { nil: undefined },
      ),
    })
    .map((r) => ({
      clusterId,
      foundName: r.foundName,
      ...(r.foundYear === undefined ? {} : { foundYear: r.foundYear }),
      ...(r.absoluteUrl === undefined ? {} : { absoluteUrl: r.absoluteUrl }),
    }));
}

/** Display_Info for an arbitrary cluster. */
export const arbDisplayInfo: fc.Arbitrary<CheckDisplayInfo> = arbClusterId.chain(arbDisplayInfoFor);

/** A Document whose every Full_Citation and every quotation carries a generated result. */
export type CheckedDocument = Readonly<{
  document: Document;
  /** Display_Info by Issue_Key. About one in five entries names a different cluster than the result does. */
  info: ReadonlyMap<IssueKey, CheckDisplayInfo>;
}>;

const clusterOf = (r: VerificationResult): string | null =>
  r.status === "verified" || r.status === "wrong_case" ? r.clusterId : null;

function infoFor(
  doc: Document,
  mismatched: readonly boolean[],
  infos: readonly CheckDisplayInfo[],
): ReadonlyMap<IssueKey, CheckDisplayInfo> {
  const entries: [IssueKey, CheckDisplayInfo][] = [];
  fullRecordsOf(doc).forEach((r, i) => {
    const cluster = clusterOf(r.result);
    const info = infos[i % infos.length];
    if (cluster === null || info === undefined) return;
    const wrong = mismatched[i % mismatched.length] === true;
    entries.push([r.key, { ...info, clusterId: wrong ? `${cluster}0` : cluster }]);
  });
  return new Map(entries);
}

/**
 * `arbDocument` with a result written to every Full_Citation and every
 * quotation (a write the Engine refuses is skipped), and Display_Info for each
 * resolved citation.
 */
export const arbCheckedDocument: fc.Arbitrary<CheckedDocument> = arbDocument.chain((base) => {
  const fulls = fullRecordsOf(base);
  const verification = fc.tuple(
    ...fulls.map((r) =>
      arbVerificationResult.map((result): StateWrite => ({
        kind: "verification",
        key: r.key,
        result,
      })),
    ),
  );
  const quotes = fc.tuple(
    ...base.quotes.map((q) =>
      arbQuoteCheckResult(q.quote.end - q.quote.start).map(
        (result: QuoteCheckResult): StateWrite => ({ kind: "quote", key: q.key, result }),
      ),
    ),
  );
  return fc
    .tuple(
      verification,
      quotes,
      fc.array(
        fc.integer({ min: 0, max: 4 }).map((n) => n === 0),
        { minLength: 1, maxLength: 8 },
      ),
      fc.array(arbDisplayInfo, { minLength: 1, maxLength: 8 }),
    )
    .map(([v, q, mismatched, infos]) => {
      const document = applyStateWrites(base, [...v, ...q]);
      return { document, info: infoFor(document, mismatched, infos) };
    });
});

/** A quotation text as its parts: words, the white space around them, and spare material for variants. */
export type QuotationParts = Readonly<{
  words: readonly string[];
  /** `words.length + 1` gaps; the inner ones are never empty. */
  gaps: readonly string[];
  /** Another set of gaps of the same shape, for changing white space between words. */
  otherGaps: readonly string[];
  /** Words that may be added after the last word. */
  extra: readonly string[];
}>;

const WORD_UNITS: readonly string[] = [
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."ABCDEZ".split(""),
  ..."0123".split(""),
  "É",
  "ß",
  "ñ",
  "ж",
  "漢",
  "'",
  "’",
  "‘",
  "“",
  "”",
  "-",
  ",",
  ".",
];

const arbQuotationWord: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...WORD_UNITS), { minLength: 1, maxLength: 8 })
  .map((units) => units.join(""));

const arbGap: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(" ", "\t", "\n", "\u2003"), { minLength: 1, maxLength: 4 })
  .map((units) => units.join(""));

function arbGaps(count: number): fc.Arbitrary<string[]> {
  return fc
    .tuple(
      fc.array(arbGap, { minLength: count + 1, maxLength: count + 1 }),
      fc.array(fc.boolean(), { minLength: 2, maxLength: 2 }),
    )
    .map(([gaps, trims]) =>
      gaps.map((gap, i) =>
        (i === 0 && trims[0] === true) || (i === count && trims[1] === true) ? "" : gap,
      ),
    );
}

/** Quotation text made of Unicode words, apostrophes and curly marks, separated by runs of white space. */
export const arbQuotationParts: fc.Arbitrary<QuotationParts> = fc
  .array(arbQuotationWord, { maxLength: 12 })
  .chain((words) =>
    fc.record({
      words: fc.constant(words),
      gaps: arbGaps(words.length),
      otherGaps: arbGaps(words.length),
      extra: fc.array(arbQuotationWord, { maxLength: 4 }),
    }),
  );

/** The text of `words` with `gaps` between and around them. */
export function joinQuotation(words: readonly string[], gaps: readonly string[]): string {
  return words.map((w, i) => `${gaps[i] ?? ""}${w}`).join("") + (gaps[words.length] ?? "");
}

/** The saved entries of one draft: a Display_Info map to store, and stored entries a reader must drop. */
export type SavedEntries = Readonly<{
  /** Valid entries: matching `clusterId`, stale `clusterId`, and keys the Document does not have. */
  info: ReadonlyMap<IssueKey, CheckDisplayInfo>;
  /** Stored entries with wrong types, to be put in the stored `resolved` array. */
  junk: readonly unknown[];
}>;

const arbJunkEntry: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.string(),
  fc.record({ key: fc.integer(), clusterId: arbClusterId, foundName: arbFoundName }),
  fc.record({ key: fc.string({ minLength: 1 }), clusterId: fc.integer(), foundName: arbFoundName }),
  fc.record({ key: fc.string({ minLength: 1 }), clusterId: arbClusterId }),
  fc.record({
    key: fc.string({ minLength: 1 }),
    clusterId: arbClusterId,
    foundName: arbFoundName,
    foundYear: fc.string(),
  }),
  fc.record({
    key: fc.string({ minLength: 1 }),
    clusterId: arbClusterId,
    foundName: arbFoundName,
    absoluteUrl: fc.integer(),
  }),
);

/**
 * Saved-entry lists for `doc`: for each Full_Citation, an entry whose `clusterId` matches its
 * result, differs from it, or is absent; entries under keys the Document lacks; and wrong-typed
 * stored entries.
 */
export function arbSavedEntries(doc: Document): fc.Arbitrary<SavedEntries> {
  const fulls = fullRecordsOf(doc);
  const arbOwn = fc.tuple(
    ...fulls.map((r) =>
      fc.tuple(fc.constantFrom("match", "stale", "absent"), arbDisplayInfo).map(([how, i]) => {
        const cluster = clusterOf(r.result);
        if (how === "absent") return null;
        const id = how === "match" && cluster !== null ? cluster : `${cluster ?? i.clusterId}7`;
        return [r.key, { ...i, clusterId: id }] as const;
      }),
    ),
  );
  const arbForeign = fc.array(
    fc
      .tuple(fc.integer({ min: 0, max: 999 }), arbDisplayInfo)
      .map(([n, i]) => [`unknown:${String(n)}`, i] as const),
    { maxLength: 3 },
  );
  return fc
    .tuple(arbOwn, arbForeign, fc.array(arbJunkEntry, { maxLength: 4 }))
    .map(([own, foreign, junk]) => {
      const entries: [IssueKey, CheckDisplayInfo][] = [];
      for (const e of [...own, ...foreign]) if (e !== null) entries.push([e[0], e[1]]);
      return { info: new Map(entries), junk };
    });
}
