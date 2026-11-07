import { escapePayload, escapeRetained } from "../../src/codes/syntax";
import type { CitationRecord, Document, Override, QuoteRecord, Span } from "../../src/types";
import { verificationOf } from "../../src/verification";

// Independent model for Property 39: built from the Document, never from render().

type Field = readonly [string, readonly string[]];
export type Expected = Readonly<{ offset: number; rank: number; code: string }>;

/** Req 19.6 order, written out here rather than imported from the renderer. */
const ORDER = {
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

export const VOCABULARY = [
  "HUM",
  "PST",
  "AI",
  "AI>HUM",
  "CIT ✓",
  "CIT ✘",
  "CIT ?",
  "CIT …",
  "QUO ✓",
  "QUO ✘",
  "QUO …",
  "REF",
  "/CIT",
  "/QUO",
  "/REF",
  "OVR",
  "DOC",
];

function token(
  name: string,
  retained: string | null,
  fields: readonly Field[],
  mode: "full" | "display",
): string {
  const head = retained === null ? name : `${name}:${escapeRetained(retained)}`;
  if (mode === "display" || fields.length === 0) return `[${head}]`;
  const body = fields.map(([k, vs]) => `${k}=${vs.map(escapePayload).join(",")}`);
  return `[${head}{${body.join(";")}}]`;
}

function docToken(d: Document, mode: "full" | "display"): string {
  const runFields = d.runs.map((r): Field => [
    "r",
    [r.runId, String(r.originalLength), String(r.editedCount), r.relabelled ? "1" : "0"],
  ]);
  return token("DOC", null, [["v", ["1"]], ["n", [String(d.keyCounter)]], ...runFields], mode);
}

function spanToken(s: Span, mode: "full" | "display"): string {
  const { origin, runId, timestamp } = s.provenance;
  const retained = origin === "AI" || origin === "AI>HUM" ? (runId ?? "") : null;
  return token(origin, retained, [["t", [timestamp]]], mode);
}

function citationToken(
  d: Document,
  rec: Exclude<CitationRecord, { kind: "other" }>,
  mode: "full" | "display",
): string {
  const r = verificationOf(d, rec.key) ?? ({ status: "unchecked" } as const);
  const full = rec.kind === "full";
  const k: Field = ["k", [rec.key]];
  switch (r.status) {
    case "verified":
      return token("CIT ✓", null, full ? [k, ["cl", [r.clusterId]]] : [k], mode);
    case "ambiguous":
      return token(
        "CIT ?",
        String(r.candidates.length),
        full ? [k, ["cs", r.candidates]] : [k],
        mode,
      );
    case "not_found":
      return token(
        "CIT ✘",
        null,
        full && r.reason !== undefined ? [k, ["why", [r.reason]]] : [k],
        mode,
      );
    case "unchecked":
      return token(
        "CIT …",
        null,
        full && r.waitUntil !== undefined ? [k, ["wu", [r.waitUntil]]] : [k],
        mode,
      );
  }
}

function quoteToken(q: QuoteRecord, mode: "full" | "display"): string {
  const k: Field = ["k", [q.key]];
  switch (q.result.status) {
    case "match":
      return token("QUO ✓", null, [k], mode);
    case "mismatch":
      return token("QUO ✘", null, [k, ["p", [String(q.result.prefixLength)]]], mode);
    case "unchecked":
      return token("QUO …", null, [k], mode);
  }
}

function overrideEvent(d: Document, o: Override, mode: "full" | "display"): Expected[] {
  const code = token("OVR", o.reason, [["t", [o.timestamp]]], mode);
  for (const rec of d.citations) {
    if (rec.kind !== "other" && rec.key === o.key) {
      return [{ offset: rec.citation.start, rank: ORDER.citOvr, code }];
    }
  }
  const q = d.quotes.find((x) => x.key === o.key);
  return q === undefined ? [] : [{ offset: q.quote.start, rank: ORDER.quoOvr, code }];
}

function structureEvents(d: Document, mode: "full" | "display"): Expected[] {
  const ev: Expected[] = [];
  if (mode === "full") ev.push({ offset: 0, rank: ORDER.doc, code: docToken(d, mode) });
  for (const s of d.spans) ev.push({ offset: s.start, rank: ORDER.span, code: spanToken(s, mode) });
  for (const rec of d.citations) {
    const { start, end } = rec.citation;
    if (rec.kind === "other") {
      ev.push({ offset: start, rank: ORDER.ref, code: token("REF", null, [], mode) });
      ev.push({ offset: end, rank: ORDER.closeRef, code: token("/REF", null, [], mode) });
    } else {
      ev.push({ offset: start, rank: ORDER.cit, code: citationToken(d, rec, mode) });
      ev.push({ offset: end, rank: ORDER.closeCit, code: token("/CIT", null, [], mode) });
    }
  }
  for (const q of d.quotes) {
    ev.push({ offset: q.quote.start, rank: ORDER.quo, code: quoteToken(q, mode) });
    ev.push({ offset: q.quote.end, rank: ORDER.closeQuo, code: token("/QUO", null, [], mode) });
  }
  return ev;
}

/** Every Code the Document implies, in Offset order and then Req 19.6 order. */
export function modelEvents(d: Document, mode: "full" | "display"): Expected[] {
  const ev = [
    ...structureEvents(d, mode),
    ...d.overrides.flatMap((o) => overrideEvent(d, o, mode)),
  ];
  return ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.offset - b.e.offset || a.e.rank - b.e.rank || a.i - b.i)
    .map((x) => x.e);
}
