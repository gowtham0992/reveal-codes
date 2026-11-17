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
