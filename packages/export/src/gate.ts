// The export gate. The only module that names `blockingIssues`.
import { blockingIssues } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import { usedAi } from "./declaration.js";
import type { OrderEntry } from "./orders-types.js";

/**
 * True when the Document may be exported: no blocking issue is left, and the
 * chosen order, if any, does not prohibit AI while the filing used AI. A pending
 * Declaration is not looked at here (design D4); the dialog gates on it separately.
 */
export function canExport(
  document: Document,
  order: OrderEntry | null,
  declaration: Declaration | null,
): boolean {
  if (order !== null && order.kind === "prohibition" && usedAi(document, order, declaration)) {
    return false;
  }
  return blockingIssues(document).length === 0;
}
