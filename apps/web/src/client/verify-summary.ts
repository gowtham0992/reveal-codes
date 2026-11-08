import type { VerifyOutcome } from "./verify-flow";

export const FAILED_NOTICE = "Verification could not be completed. Your citations are unchanged.";

/** The Notice text for a finished flow; empty for a discarded one (nothing is shown). */
export function summaryNotice(outcome: VerifyOutcome): string {
  if (outcome.status === "failed") return FAILED_NOTICE;
  if (outcome.status === "discarded") return "";
  const c = outcome.citations;
  const q = outcome.quotes;
  return (
    `Citations: ${String(c.verified)} verified, ${String(c.not_found)} not found, ` +
    `${String(c.ambiguous)} ambiguous, ${String(c.unchecked)} unchecked. ` +
    `Quotes: ${String(q.match)} match, ${String(q.mismatch)} mismatch, ${String(q.unchecked)} unchecked. ` +
    `Skipped: ${String(outcome.skipped)}. Opinions unavailable: ${String(outcome.unavailable)}.`
  );
}
