import type { QuoteCheckResult, VerificationResult } from "@reveal-codes/engine";

/** `verified <clusterId>`, `wrong_case <clusterId> <foundName>`, `not_found`, `ambiguous <n>`, `unchecked`. */
export function statusText(result: VerificationResult): string {
  switch (result.status) {
    case "verified":
      return `verified ${result.clusterId}`;
    case "wrong_case":
      return `wrong_case ${result.clusterId} ${result.foundName}`;
    case "ambiguous":
      return `ambiguous ${String(result.candidates.length)}`;
    case "not_found":
      return "not_found";
    case "unchecked":
      return "unchecked";
  }
}

/** `match`, `mismatch`, `unchecked`. */
export function quoteText(result: QuoteCheckResult): string {
  return result.status;
}
