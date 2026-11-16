import type { Document, IssueKey } from "@reveal-codes/engine";
import type { Deps } from "@reveal-codes/verifier";
export type Unavailable = Readonly<{
    waitUntil: string | null;
}>;
export type ReverifyOutcome = Readonly<{
    /** The Reverified_Document: used only as the argument of `issues`. */
    document: Document;
    /** Non-null when any re-check was unavailable; `waitUntil` is the latest one carried by an unchecked citation result. */
    unavailable: Unavailable | null;
    /** Keys whose setVerification or setQuoteCheck the Engine rejected. No Finding is made for them. */
    notRechecked: readonly IssueKey[];
}>;
/** One `lookup` for all citations, then one opinion fetch per cluster. Never mutates `document`. */
export declare function reverify(document: Document, deps: Deps): Promise<ReverifyOutcome>;
