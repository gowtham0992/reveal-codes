import { createDocument, err, ok, setVerification, verificationOf } from "@reveal-codes/engine";
import type { CitationRecord, Document, EngineError, Result } from "@reveal-codes/engine";
import { lookup } from "@reveal-codes/verifier";
import type { ToolContext } from "../context";
import { errorResult, okResult } from "../results";
import type { ToolResult } from "../results";
import { lookupCitationsShape, parseArgs } from "../schemas";

type FullRecord = Extract<CitationRecord, { kind: "full" }>;
type DocResult = Result<Document, string>;

const fail = (index: number, e: EngineError): Result<never, string> =>
  err(`citations[${String(index)}]: the text could not be read (${e.kind})`);

function buildDocs(texts: readonly string[], ctx: ToolContext): Result<Document[], string> {
  const docs: Document[] = [];
  for (const [i, text] of texts.entries()) {
    const doc = createDocument(text, ctx.now().toISOString());
    if (!doc.ok) return fail(i, doc.error);
    docs.push(doc.value);
  }
  return ok(docs);
}

const fulls = (doc: Document): FullRecord[] =>
  doc.citations.filter((r): r is FullRecord => r.kind === "full");

/** Records with keys rewritten `"<i>:<key>"` so one `lookup` call keeps them unique. */
function prefixed(docs: readonly Document[]): FullRecord[] {
  return docs.flatMap((doc, i) => fulls(doc).map((r) => ({ ...r, key: `${String(i)}:${r.key}` })));
}

function applyResults(
  doc: Document,
  i: number,
  found: ReadonlyMap<string, FullRecord["result"]>,
): DocResult {
  let current = doc;
  for (const r of fulls(doc)) {
    const result = found.get(`${String(i)}:${r.key}`);
    if (result === undefined) continue;
    const next = setVerification(current, r.key, result);
    if (!next.ok) return fail(i, next.error);
    current = next.value;
  }
  return ok(current);
}

function describeDoc(doc: Document, index: number): unknown {
  const citations = doc.citations.map((r, n) => ({
    index: n,
    text: r.citation.text,
    start: r.citation.start,
    end: r.citation.end,
    kind: r.kind,
    result: r.kind === "other" ? null : verificationOf(doc, r.key),
  }));
  return { index, citations };
}

export async function handleLookupCitations(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = parseArgs(lookupCitationsShape, args);
  if (!parsed.ok) return errorResult(parsed.error);
  const docs = buildDocs(parsed.value.citations, ctx);
  if (!docs.ok) return errorResult(docs.error);
  const found = await lookup(prefixed(docs.value), ctx.deps);
  const done: Document[] = [];
  for (const [i, doc] of docs.value.entries()) {
    const applied = applyResults(doc, i, found);
    if (!applied.ok) return errorResult(applied.error);
    done.push(applied.value);
  }
  return okResult({ results: done.map(describeDoc) });
}
