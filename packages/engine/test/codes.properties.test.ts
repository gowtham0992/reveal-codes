import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse, render, strip, stripPositions } from "../src/codes";
import { escapePayload, escapeRetained, escapeText } from "../src/codes/syntax";
import { structuralEqual } from "../src/equal";
import { arbAnyString, arbDocument } from "../src/testing/arbitraries";
import type {
  CitationRecord,
  CodePosition,
  Document,
  Override,
  QuoteRecord,
  Span,
} from "../src/types";
import { verificationOf } from "../src/verification";
import { runs } from "./support/fc";

describe("Property 36: Full Reveal Codes round trip _Requirements: 19.2, 19.3, 20.1, 20.2_", () => {
  it("parse(render(d, full)) is ok, equals d, and re-renders to the same text", () => {
    // Property 36
    fc.assert(
      fc.property(arbDocument, (d) => {
        const text = render(d, "full").text;
        const parsed = parse(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(structuralEqual(parsed.value, d)).toBe(true);
        expect(render(parsed.value, "full").text).toBe(text);
      }),
      runs(),
    );
  });
});

/** Positions are sorted by offset, and each code sits at its own place in `text`. */
function expectConsistent(d: Document, text: string, positions: readonly CodePosition[]): void {
  let emitted = 0;
  let previous = 0;
  for (const p of positions) {
    expect(p.offset).toBeGreaterThanOrEqual(previous);
    previous = p.offset;
    const at = escapeText(d.text.slice(0, p.offset)).length + emitted;
    expect(text.startsWith(p.code, at)).toBe(true);
    emitted += p.code.length;
  }
}

describe("Property 37: Display is the Strip projection of full _Requirements: 19.10, 19.11, 19.12, 19.13_", () => {
  it("display is strip of full, positions project, offsets are consistent, strip is total", () => {
    // Property 37
    fc.assert(
      fc.property(fc.tuple(arbDocument, arbAnyString), ([d, garbage]) => {
        const full = render(d, "full");
        const display = render(d, "display");
        expect(display.text).toBe(strip(full.text));
        expect(strip(display.text)).toBe(display.text);

        const projected = stripPositions(full.positions);
        expect(display.positions).toEqual(projected);
        expect(projected.length).toBe(
          full.positions.filter((p) => !p.code.startsWith("[DOC")).length,
        );

        expectConsistent(d, full.text, full.positions);
        expectConsistent(d, display.text, display.positions);

        expect(strip(garbage).length).toBeLessThanOrEqual(garbage.length);
      }),
      runs(),
    );
  });
});

/** Test-local: drop every `[`..`]` Code, treating `\x` pairs as text, then unescape `\[` `\]` `\\`. */
function removeCodesAndUnescape(rendered: string): string {
  let kept = "";
  let i = 0;
  while (i < rendered.length) {
    const c = rendered[i] as string;
    if (c === "\\" && i + 1 < rendered.length) {
      kept += rendered.slice(i, i + 2);
      i += 2;
    } else if (c === "[") {
      i += 1;
      while (i < rendered.length && rendered[i] !== "]") i += rendered[i] === "\\" ? 2 : 1;
      i += 1;
    } else {
      kept += c;
      i += 1;
    }
  }
  return kept.replace(/\\([[\]\\])/g, "$1");
}

describe("Property 38: Removing Codes and unescaping yields the Text _Requirements: 19.3, 19.5_", () => {
  it("removing every Code and unescaping gives d.text in both modes", () => {
    // Property 38
    fc.assert(
      fc.property(arbDocument, fc.constantFrom("full", "display"), (d, mode) => {
        expect(removeCodesAndUnescape(render(d, mode).text)).toBe(d.text);
      }),
      runs(),
    );
  });
});

// Independent model for Property 39: built from the Document, never from render().

type Field = readonly [string, readonly string[]];
type Expected = Readonly<{ offset: number; rank: number; code: string }>;

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

const VOCABULARY = [
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
function modelEvents(d: Document, mode: "full" | "display"): Expected[] {
  const ev = [
    ...structureEvents(d, mode),
    ...d.overrides.flatMap((o) => overrideEvent(d, o, mode)),
  ];
  return ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.offset - b.e.offset || a.e.rank - b.e.rank || a.i - b.i)
    .map((x) => x.e);
}

describe("Property 39: Codes match the document structure _Requirements: 19.1, 19.2, 19.4, 19.6, 19.7, 19.8_", () => {
  it("positions equal the independent model, with a vocabulary-only code set and one DOC in full", () => {
    // Property 39
    fc.assert(
      fc.property(arbDocument, fc.constantFrom("full", "display"), (d, mode) => {
        const actual = render(d, mode).positions;
        const expected = modelEvents(d, mode);
        expect(actual.map((p) => p.offset)).toEqual(expected.map((e) => e.offset));
        expect(actual.map((p) => p.code)).toEqual(expected.map((e) => e.code));

        const names = actual.map((p) => /^\[([^:{\]]*)/.exec(p.code)?.[1] ?? "");
        for (const n of names) expect(VOCABULARY).toContain(n);
        expect(names.filter((n) => n === "DOC").length).toBe(mode === "full" ? 1 : 0);
        if (mode === "full") expect(actual[0]?.offset).toBe(0);
        expect(names.filter((n) => n === "OVR").length).toBe(d.overrides.length);
      }),
      runs(),
    );
  });
});
