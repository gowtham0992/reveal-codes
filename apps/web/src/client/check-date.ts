import type { Document } from "@reveal-codes/engine";
import { hasFullRecord } from "./verify-flow";

/** Verification_Result: a full citation or a quote whose status is not "unchecked". Short forms do not count. */
export function hasVerificationResult(document: Document): boolean {
  const citation = document.citations.some(
    (c) => c.kind === "full" && c.result.status !== "unchecked",
  );
  return citation || document.quotes.some((q) => q.result.status !== "unchecked");
}

/** The Check_Date_Gap, limited to a Document that Verify can run on. */
export function needsCheckDate(document: Document, verifiedAt: string | null): boolean {
  return verifiedAt === null && hasVerificationResult(document) && hasFullRecord(document);
}
