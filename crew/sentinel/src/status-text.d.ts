import type { QuoteCheckResult, VerificationResult } from "@reveal-codes/engine";
/** `verified <clusterId>`, `wrong_case <clusterId> <foundName>`, `not_found`, `ambiguous <n>`, `unchecked`. */
export declare function statusText(result: VerificationResult): string;
/** `match`, `mismatch`, `unchecked`. */
export declare function quoteText(result: QuoteCheckResult): string;
