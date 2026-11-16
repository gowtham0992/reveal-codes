import { declareAi } from "@reveal-codes/engine";
import type { Declaration } from "@reveal-codes/engine";
import { buildStatement, renderStatement } from "../../src/index.js";
import type { OrderContext } from "../../src/index.js";
import { DEMO_NOW, DEMO_RUN_LOG, DEMO_VERIFIED_AT, buildDemoDocument } from "./demo-document.js";

/** The demo motion is pasted, so its statement needs the author's Declaration. */
function demoDeclaration(): Declaration {
  const made = declareAi("pasted_text", "ChatGPT (GPT-4o)");
  if (!made.ok) throw new Error(`demo declaration rejected: ${made.error}`);
  return made.value;
}

export const DEMO_DECLARATION: Declaration = demoDeclaration();

export async function buildDemoDocumentStatement(
  orderContext: OrderContext = null,
  declaration: Declaration | null = DEMO_DECLARATION,
) {
  const doc = await buildDemoDocument();
  const meta = { now: DEMO_NOW, verifiedAt: DEMO_VERIFIED_AT };
  const r = buildStatement(doc, DEMO_RUN_LOG, meta, orderContext, declaration);
  if (!r.ok) throw new Error(`statement: ${r.error.kind}`);
  return { statement: r.value, blocks: renderStatement(r.value) };
}
