import type { Document, VerificationResult } from "@reveal-codes/engine";
import type { ReverifyOutcome } from "./reverify.js";
import type { Finding, SentinelError } from "./types.js";
export type FindingInput = Readonly<{
    file: string;
    recorded: Document;
    bodyText: string;
    outcome: ReverifyOutcome;
}>;
export declare function unreadable(file: string, kind: SentinelError["kind"]): Finding;
/**
 * D16: the status differs, or both are verified (or both wrong_case) with
 * different cluster ids. Two wrong_case results with the same cluster id are
 * not a finding, whatever their found names are.
 */
export declare function citationDiffers(old: VerificationResult, now: VerificationResult): boolean;
/** Pure function of `input`; order follows D3. */
export declare function deriveFindings(input: FindingInput): readonly Finding[];
