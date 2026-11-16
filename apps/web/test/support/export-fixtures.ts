import { blockingIssues, declareAi, recordOverride } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import { createStore } from "../../src/store-runtime";
import type { Store } from "../../src/store-runtime";
import { ISO, verifiedDemoDocument } from "./persist-fixtures";

export const EXPORT_NOW = new Date("2026-11-20T12:00:00.000Z");
export const EXPORT_VERIFIED_AT = "2026-11-20T18:25:00.000Z";

/** The verified demo motion with a written override on every blocking issue. */
export async function gateClearDocument(): Promise<Document> {
  const verified = await verifiedDemoDocument();
  let doc = verified;
  blockingIssues(verified).forEach((issue, i) => {
    const r = recordOverride(doc, issue.key, `Reason number ${String(i + 1)} for this item.`, ISO);
    if (!r.ok) throw new Error(`override rejected: ${r.error.kind}`);
    doc = r.value;
  });
  return doc;
}

/** The author's answer for pasted text: generative AI was used, with a named tool. */
export function pastedAiDeclaration(): Declaration {
  const made = declareAi("pasted_text", "ChatGPT");
  if (!made.ok) throw new Error(`declaration rejected: ${made.error}`);
  return made.value;
}
/**
 * A Store holding `document` and a Verify time. The stored Declaration answers for pasted
 * text by default; it is ignored by every gate when the Document holds no substantive pasted text.
 */
export function storeWith(
  document: Document,
  verifiedAt: string | null,
  declaration: Declaration | null = pastedAiDeclaration(),
): Store {
  const store = createStore(() => EXPORT_NOW);
  store.dispatch({ type: "replace", document, verifiedAt, declaration });
  return store;
}
