// The export gate. The only module that names `blockingIssues`.
import { blockingIssues } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import type { OrderEntry } from "./orders-types.js";
import { usedAi } from "./statement-parts.js";

/**
 * True when the Document may be exported: no blocking issue is left, and the
 * chosen order, if any, does not prohibit AI while the Document uses AI.
 */
export function canExport(document: Document, order: OrderEntry | null): boolean {
  if (order !== null && order.kind === "prohibition" && usedAi(document)) return false;
  return blockingIssues(document).length === 0;
}
