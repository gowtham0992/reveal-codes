/**
 * Document-level Req 20.4 rules: coverage, canonical form, provenance shape,
 * surrogates, and the Run invariant (design A12 step 3). Each returns the
 * first fault or `undefined`.
 */
import { checkCoverage, isMergeable } from "../spans.js";
import type { Span } from "../types.js";
import { checkProvenance, firstUnpairedSurrogate } from "../validate.js";
import { fault } from "./check-types.js";
import type { CheckFault } from "./check-types.js";
import type { DraftDocument } from "./decode-types.js";

const toSpans = (d: DraftDocument): Span[] =>
  d.spans.map((s) => ({ start: s.start, end: s.end, provenance: s.provenance }));

/** Coverage_Invariant. The fault sits at the span Code at the violation, else at 0. */
export function checkSpanCoverage(d: DraftDocument): CheckFault | undefined {
  const r = checkCoverage(d.text.length, toSpans(d));
  if (r.ok) return undefined;
  const { offset, violation } = r.error;
  const at = d.spans.find((s) => (violation === "gap" ? s.start > offset : s.start === offset));
  return fault(violation === "coverage" ? 0 : (at?.index ?? 0), "coverage");
}

/** Req 3.3: no two adjacent Spans are Mergeable. */
export function checkCanonical(d: DraftDocument): CheckFault | undefined {
  for (let i = 1; i < d.spans.length; i++) {
    const a = d.spans[i - 1];
    const b = d.spans[i];
    if (a !== undefined && b !== undefined && isMergeable(a.provenance, b.provenance)) {
      return fault(b.index, "canonical");
    }
  }
  return undefined;
}

/** Req 2.5 shape of each span's Provenance_Record. */
export function checkSpanProvenance(d: DraftDocument): CheckFault | undefined {
  for (const s of d.spans) {
    if (!checkProvenance(s.provenance).ok) return fault(s.index, "provenance");
  }
  return undefined;
}

/** Req 2.6: no unpaired surrogate in the Text. */
export function checkSurrogates(d: DraftDocument): CheckFault | undefined {
  return firstUnpairedSurrogate(d.text) === null ? undefined : fault(0, "surrogate");
}

function checkRunTable(d: DraftDocument): CheckFault | undefined {
  for (let i = 0; i < d.runs.length; i++) {
    const r = d.runs[i];
    const prev = d.runs[i - 1];
    if (r === undefined) continue;
    // Strictly ascending in UTF-16 code unit order (sorted, no duplicates).
    if (prev !== undefined && prev.runId >= r.runId) return fault(0, "run_invariant");
    if (r.originalLength < 1) return fault(0, "run_invariant");
  }
  return undefined;
}

/** Req 6.12 plus `originalLength >= 1` and sorted Runs. */
export function checkRunInvariant(d: DraftDocument): CheckFault | undefined {
  const table = checkRunTable(d);
  if (table !== undefined) return table;
  const byId = new Map(d.runs.map((r) => [r.runId, r] as const));
  for (const s of d.spans) {
    const { runId, origin } = s.provenance;
    if (runId === undefined) continue;
    const run = byId.get(runId);
    const expected = run?.relabelled === true ? "AI>HUM" : "AI";
    if (run === undefined || origin !== expected) return fault(s.index, "run_invariant");
  }
  return undefined;
}
