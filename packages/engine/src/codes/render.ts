/**
 * Reveal Codes renderer (design A11, Req 19). Builds per-offset close and
 * open events in the Req 19.6 order, then emits Text and Codes in one pass,
 * building Code_Positions as it goes.
 */
import type { Declaration } from "../declaration.js";
import type {
  CitationRecord,
  CodePosition,
  Document,
  Override,
  QuoteRecord,
  RenderMode,
  Rendering,
  Span,
  VerificationResult,
} from "../types.js";
import { verificationOf } from "../verification.js";
import { encodeDeclaration } from "./doc-declaration.js";
import { CODE_NAMES, codeString, escapeText } from "./syntax.js";
import type { CodeField, CodeName } from "./syntax.js";

/** Rank of an event among those sharing an Offset (Req 19.6). */
const RANK = {
  doc: 0,
  closeQuo: 1,
  closeCit: 2,
  closeRef: 3,
  span: 4,
  cit: 5,
  citOvr: 6,
  ref: 7,
  quo: 8,
  quoOvr: 9,
} as const;

type Event = Readonly<{ offset: number; rank: number; code: string }>;

const field = (key: string, ...values: readonly string[]): CodeField => ({ key, values });

function docCode(doc: Document, declaration: Declaration | null, mode: RenderMode): string {
  const runs = doc.runs.map((r) =>
    field("r", r.runId, String(r.originalLength), String(r.editedCount), r.relabelled ? "1" : "0"),
  );
  const d = declaration === null ? [] : [encodeDeclaration(declaration)];
  const fields = [field("v", "1"), field("n", String(doc.keyCounter)), ...d, ...runs];
  return codeString(CODE_NAMES.doc, null, fields, mode);
}

function spanCode(span: Span, mode: RenderMode): string {
  const { origin, runId, timestamp } = span.provenance;
  const fields = [field("t", timestamp)];
  switch (origin) {
    case "HUM":
      return codeString(CODE_NAMES.hum, null, fields, mode);
    case "PST":
      return codeString(CODE_NAMES.pst, null, fields, mode);
    case "AI":
      return codeString(CODE_NAMES.ai, runId ?? "", fields, mode);
    case "AI>HUM":
      return codeString(CODE_NAMES.aiHum, runId ?? "", fields, mode);
  }
}

type Opening = Readonly<{ name: CodeName; retained: string | null; fields: readonly CodeField[] }>;

function wrongCaseFields(
  k: CodeField,
  result: Extract<VerificationResult, { status: "wrong_case" }>,
): readonly CodeField[] {
  return [
    k,
    field("cl", result.clusterId),
    field("nm", result.foundName),
    ...(result.foundYear === undefined ? [] : [field("yr", String(result.foundYear))]),
  ];
}

function citationOpening(rec: CitationRecord, result: VerificationResult): Opening {
  const full = rec.kind === "full";
  const key = rec.kind === "other" ? "" : rec.key;
  const k = field("k", key);
  switch (result.status) {
    case "verified":
      return {
        name: CODE_NAMES.citVerified,
        retained: null,
        fields: full ? [k, field("cl", result.clusterId)] : [k],
      };
    case "ambiguous":
      return {
        name: CODE_NAMES.citAmbiguous,
        retained: String(result.candidates.length),
        fields: full ? [k, field("cs", ...result.candidates)] : [k],
      };
    case "wrong_case":
      return {
        name: CODE_NAMES.citWrongCase,
        retained: null,
        fields: full ? wrongCaseFields(k, result) : [k],
      };
    case "not_found":
      return {
        name: CODE_NAMES.citNotFound,
        retained: null,
        fields: full && result.reason !== undefined ? [k, field("why", result.reason)] : [k],
      };
    case "unchecked":
      return {
        name: CODE_NAMES.citUnchecked,
        retained: null,
        fields: full && result.waitUntil !== undefined ? [k, field("wu", result.waitUntil)] : [k],
      };
  }
}

function quoteOpening(q: QuoteRecord): Opening {
  const k = field("k", q.key);
  switch (q.result.status) {
    case "match":
      return { name: CODE_NAMES.quoVerified, retained: null, fields: [k] };
    case "mismatch":
      return {
        name: CODE_NAMES.quoMismatch,
        retained: null,
        fields: [k, field("p", String(q.result.prefixLength))],
      };
    case "unchecked":
      return { name: CODE_NAMES.quoUnchecked, retained: null, fields: [k] };
  }
}

function ovrCode(o: Override, mode: RenderMode): string {
  return codeString(CODE_NAMES.ovr, o.reason, [field("t", o.timestamp)], mode);
}

function bare(name: CodeName, mode: RenderMode): string {
  return codeString(name, null, [], mode);
}

function citationEvents(doc: Document, mode: RenderMode, byKey: Map<string, Override>): Event[] {
  const out: Event[] = [];
  for (const rec of doc.citations) {
    const { start, end } = rec.citation;
    if (rec.kind === "other") {
      out.push({ offset: start, rank: RANK.ref, code: bare(CODE_NAMES.ref, mode) });
      out.push({ offset: end, rank: RANK.closeRef, code: bare(CODE_NAMES.closeRef, mode) });
      continue;
    }
    const result = verificationOf(doc, rec.key) ?? { status: "unchecked" as const };
    const o = citationOpening(rec, result);
    out.push({
      offset: start,
      rank: RANK.cit,
      code: codeString(o.name, o.retained, o.fields, mode),
    });
    const ovr = byKey.get(rec.key);
    if (ovr !== undefined) {
      out.push({ offset: start, rank: RANK.citOvr, code: ovrCode(ovr, mode) });
    }
    out.push({ offset: end, rank: RANK.closeCit, code: bare(CODE_NAMES.closeCit, mode) });
  }
  return out;
}

function quoteEvents(doc: Document, mode: RenderMode, byKey: Map<string, Override>): Event[] {
  const out: Event[] = [];
  for (const q of doc.quotes) {
    const o = quoteOpening(q);
    const { start, end } = q.quote;
    out.push({
      offset: start,
      rank: RANK.quo,
      code: codeString(o.name, o.retained, o.fields, mode),
    });
    const ovr = byKey.get(q.key);
    if (ovr !== undefined) out.push({ offset: start, rank: RANK.quoOvr, code: ovrCode(ovr, mode) });
    out.push({ offset: end, rank: RANK.closeQuo, code: bare(CODE_NAMES.closeQuo, mode) });
  }
  return out;
}

function collectEvents(doc: Document, declaration: Declaration | null, mode: RenderMode): Event[] {
  const byKey = new Map(doc.overrides.map((o) => [o.key, o] as const));
  const events: Event[] = [];
  if (mode === "full")
    events.push({ offset: 0, rank: RANK.doc, code: docCode(doc, declaration, mode) });
  for (const s of doc.spans) {
    events.push({ offset: s.start, rank: RANK.span, code: spanCode(s, mode) });
  }
  events.push(...citationEvents(doc, mode, byKey), ...quoteEvents(doc, mode, byKey));
  // Array.prototype.sort is stable, so equal (offset, rank) keep insertion order.
  return events.sort((a, b) => a.offset - b.offset || a.rank - b.rank);
}

/**
 * Renders a Document as Reveal_Codes_Text plus Code_Positions (Req 19). In
 * `display` mode `[DOC]` and every Payload_Section are omitted (Req 19.10),
 * so the Declaration is never written there. A `null` Declaration gives the
 * same bytes as before the `d` field existed.
 */
export function renderRecord(
  doc: Document,
  declaration: Declaration | null,
  mode: RenderMode,
): Rendering {
  const events = collectEvents(doc, declaration, mode);
  const positions: CodePosition[] = [];
  let out = "";
  let cursor = 0;
  for (const e of events) {
    out += escapeText(doc.text.slice(cursor, e.offset));
    cursor = e.offset;
    out += e.code;
    positions.push({ offset: e.offset, code: e.code });
  }
  out += escapeText(doc.text.slice(cursor));
  return { text: out, positions };
}

/** Renders a Document with no Declaration. */
export function render(doc: Document, mode: RenderMode): Rendering {
  return renderRecord(doc, null, mode);
}
