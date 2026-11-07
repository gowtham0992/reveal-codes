/**
 * Extractor cross-check (design A12 step 3, Req 20.5, rule
 * `extractor_mismatch`): the decoded `[CIT …]`, `[QUO …]`, and `[REF]` ranges
 * must equal the Extractor's ranges, in both directions.
 */
import { fault, rangeKey } from "./check-types.js";
import type { CheckFault, CheckInput } from "./check-types.js";

type Ranged = Readonly<{ index: number; start: number; end: number }>;
type Plain = Readonly<{ start: number; end: number }>;

/** Faults for one family: extra or duplicate Codes at their index, missing Codes at 0. */
function compareFamily(codes: readonly Ranged[], expected: readonly Plain[]): CheckFault[] {
  const want = new Set(expected.map((e) => rangeKey(e.start, e.end)));
  const seen = new Set<string>();
  const out: CheckFault[] = [];
  for (const c of codes) {
    const k = rangeKey(c.start, c.end);
    if (!want.has(k) || seen.has(k)) out.push(fault(c.index, "extractor_mismatch"));
    seen.add(k);
  }
  for (const k of want) if (!seen.has(k)) out.push(fault(0, "extractor_mismatch"));
  return out;
}

/** Returns the lowest-index mismatch, or undefined when all three families agree. */
export function checkExtractor(i: CheckInput): CheckFault | undefined {
  const { citations, quotes } = i.extraction;
  const found = [
    ...compareFamily(
      i.draft.citations,
      citations.filter((c) => c.value.kind !== "other"),
    ),
    ...compareFamily(i.draft.quotes, quotes),
    ...compareFamily(
      i.draft.refs,
      citations.filter((c) => c.value.kind === "other"),
    ),
  ];
  return found.sort((a, b) => a.index - b.index)[0];
}
