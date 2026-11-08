import { buildStatement, renderStatement } from "../../src/index.js";
import { DEMO_NOW, DEMO_RUN_LOG, DEMO_VERIFIED_AT, buildDemoDocument } from "./demo-document.js";

export async function buildDemoDocumentStatement() {
  const doc = await buildDemoDocument();
  const r = buildStatement(doc, DEMO_RUN_LOG, { now: DEMO_NOW, verifiedAt: DEMO_VERIFIED_AT });
  if (!r.ok) throw new Error("statement");
  return { statement: r.value, blocks: renderStatement(r.value) };
}
