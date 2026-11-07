/**
 * Semantic check of a draft Document (design A12 step 3; Req 20.4, 20.5).
 *
 * Runs every Req 20.4 rule in a fixed order and reports the first violation
 * with its `rule` tag and the input index of the offending Code (0 for
 * whole-document rules and for a Code the Extractor expects but the input
 * lacks). Then cross-checks the decoded ranges against `extract(text)`.
 * Total: nothing here throws.
 */
import { extract } from "../citations/extract.js";
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import {
  checkCanonical,
  checkRunInvariant,
  checkSpanCoverage,
  checkSpanProvenance,
  checkSurrogates,
} from "./check-doc.js";
import {
  checkFullPayloads,
  checkIssueKeys,
  checkOverrideTargets,
  checkQuotePrefix,
  checkRefCodes,
  checkShortForms,
  checkUnverifiable,
} from "./check-citations.js";
import { checkExtractor } from "./check-extractor.js";
import { rangeKey } from "./check-types.js";
import type { CheckFault, CheckInput, CheckedDraft } from "./check-types.js";
import type { DraftDocument } from "./decode-types.js";

export type { CheckFault, CheckedDraft } from "./check-types.js";

type Rule = (i: CheckInput) => CheckFault | undefined;

/** Document-only rules (they need no Extractor output), then Extractor-backed ones. */
const RULES: readonly Rule[] = [
  (i) => checkSpanCoverage(i.draft),
  (i) => checkCanonical(i.draft),
  (i) => checkSpanProvenance(i.draft),
  (i) => checkSurrogates(i.draft),
  checkFullPayloads,
  checkQuotePrefix,
  checkShortForms,
  checkUnverifiable,
  checkRefCodes,
  (i) => checkRunInvariant(i.draft),
  checkOverrideTargets,
  checkIssueKeys,
  checkExtractor,
];

/**
 * Checks `draft`. Returns it with the Extractor output on success, or the
 * first rule violation as a fault.
 */
export function check(draft: DraftDocument): Result<CheckedDraft, CheckFault> {
  const extraction = extract(draft.text);
  const byRange = new Map(extraction.citations.map((c) => [rangeKey(c.start, c.end), c] as const));
  const input: CheckInput = { draft, extraction, byRange };
  for (const rule of RULES) {
    const f = rule(input);
    if (f !== undefined) return err(f);
  }
  return ok({ draft, extraction });
}
