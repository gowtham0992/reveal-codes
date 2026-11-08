// The export gate. The only module that names `blockingIssues`.
import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";

/** True when the Document has no blocking issue left, so it may be exported. */
export function canExport(document: Document): boolean {
  return blockingIssues(document).length === 0;
}
