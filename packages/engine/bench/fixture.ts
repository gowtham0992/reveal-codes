/**
 * Deterministic benchmark Document (Req 21.1, design "Benchmark harness").
 *
 * Built only through the public API (`createDocument`, `apply`) from
 * `BENCH_SEED` with a local mulberry32 PRNG. No clock and no `Math.random`.
 * Layout: 500 Spans in total. The first 200 alternate HUM and PST and sit
 * outside every Run_Extent. The last 300 form 12 blocks of 25 Spans; each
 * block interleaves one Run's AI Spans with HUM and PST Spans.
 */
import { apply, createDocument } from "../src/index.js";
import type { Document, Origin, Provenance } from "../src/index.js";

export const BENCH_SEED = 20261103;

export const TEXT_LENGTH = 50_000;
export const SPAN_COUNT = 500;
export const CITATION_COUNT = 100;
export const MIN_RUNS = 10;
export const MIN_QUOTES = 20;

const TIMESTAMP = "2026-01-01T00:00:00Z";
const UNIT_LENGTH = TEXT_LENGTH / CITATION_COUNT;
const PLAIN_SPANS = 200;
const BLOCK_SPANS = 25;
const REPORTERS = ["U.S.", "F.2d", "F.3d"] as const;
const WORDS = [
  "motion",
  "filing",
  "evidence",
  "party",
  "record",
  "court",
  "claim",
  "hearing",
  "order",
  "notice",
  "relief",
  "standard",
  "review",
  "discovery",
  "burden",
  "ruling",
  "statement",
  "request",
  "response",
  "argument",
] as const;

export type Rng = () => number;

/** mulberry32: a small deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function word(rng: Rng): string {
  return WORDS[int(rng, 0, WORDS.length - 1)] ?? "motion";
}

function words(rng: Rng, count: number): string {
  return Array.from({ length: count }, () => word(rng)).join(" ");
}

/** Digit-free, quote-free filler of exactly `n` code units, with sentence stops. */
function filler(rng: Rng, n: number): string {
  let out = "";
  let capitalise = true;
  while (out.length < n) {
    const w = word(rng);
    out += (out.length > 0 ? " " : "") + (capitalise ? w.charAt(0).toUpperCase() + w.slice(1) : w);
    capitalise = rng() < 0.12;
    if (capitalise) out += ".";
  }
  return out.slice(0, n);
}

function citation(rng: Rng): string {
  const reporter = REPORTERS[int(rng, 0, REPORTERS.length - 1)] ?? "U.S.";
  return `${String(int(rng, 1, 999))} ${reporter} ${String(int(rng, 1, 999))}`;
}

/** One unit of exactly `UNIT_LENGTH` code units holding one Full_Citation. */
function unit(rng: Rng, index: number): string {
  const cit = citation(rng);
  const core =
    index % 5 < 2
      ? `The court wrote "${words(rng, 4)}," ${cit}.`
      : `Settled law is found at ${cit}.`;
  const room = UNIT_LENGTH - core.length - 2;
  const lead = int(rng, 20, room - 20);
  return `${filler(rng, lead)} ${core} ${filler(rng, room - lead)}`;
}

function buildText(rng: Rng): string {
  return Array.from({ length: CITATION_COUNT }, (_, i) => unit(rng, i)).join("");
}

/** Cut offsets for SPAN_COUNT segments; the last cut is the text length. */
function cuts(rng: Rng): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < SPAN_COUNT - 1; i++) {
    out.push((i + 1) * (TEXT_LENGTH / SPAN_COUNT) + int(rng, -30, 30));
  }
  out.push(TEXT_LENGTH);
  return out;
}

/** Adjacent segments always differ in Origin or Run_Id, so none merge. */
function provenanceFor(index: number): Provenance {
  if (index < PLAIN_SPANS) {
    return { origin: index % 2 === 0 ? "HUM" : "PST", timestamp: TIMESTAMP };
  }
  const block = Math.floor((index - PLAIN_SPANS) / BLOCK_SPANS);
  const j = (index - PLAIN_SPANS) % BLOCK_SPANS;
  if (j % 2 === 0) {
    return { origin: "AI", runId: `r${String(block)}`, timestamp: TIMESTAMP };
  }
  const origin: Origin = j % 4 === 1 ? "HUM" : "PST";
  return { origin, timestamp: TIMESTAMP };
}

function build(text: string, cutOffsets: readonly number[]): Document {
  const created = createDocument("", TIMESTAMP);
  if (!created.ok) throw new Error(`createDocument failed: ${created.error.kind}`);
  let doc = created.value;
  let from = 0;
  cutOffsets.forEach((to, index) => {
    const applied = apply(doc, {
      kind: "insert",
      at: doc.text.length,
      text: text.slice(from, to),
      provenance: provenanceFor(index),
    });
    if (!applied.ok)
      throw new Error(`fixture insert ${String(index)} failed: ${applied.error.kind}`);
    doc = applied.value.document;
    from = to;
  });
  return doc;
}

export type DocCounts = Readonly<{
  textLength: number;
  spans: number;
  runs: number;
  fullCitations: number;
  quotes: number;
}>;

export function countsOf(doc: Document): DocCounts {
  return {
    textLength: doc.text.length,
    spans: doc.spans.length,
    runs: doc.runs.length,
    fullCitations: doc.citations.filter((c) => c.kind === "full").length,
    quotes: doc.quotes.length,
  };
}

function assertCounts(counts: DocCounts): void {
  const problems: string[] = [];
  const exact = (name: string, got: number, want: number): void => {
    if (got !== want) problems.push(`${name}: expected ${String(want)}, got ${String(got)}`);
  };
  exact("text length", counts.textLength, TEXT_LENGTH);
  exact("spans", counts.spans, SPAN_COUNT);
  exact("full citations", counts.fullCitations, CITATION_COUNT);
  if (counts.runs < MIN_RUNS)
    problems.push(`runs: expected at least ${String(MIN_RUNS)}, got ${String(counts.runs)}`);
  if (counts.quotes < MIN_QUOTES) {
    problems.push(`quotes: expected at least ${String(MIN_QUOTES)}, got ${String(counts.quotes)}`);
  }
  if (problems.length > 0) throw new Error(`Benchmark fixture is wrong: ${problems.join("; ")}`);
}

type Range = Readonly<{ start: number; end: number }>;

function runExtents(doc: Document): readonly Range[] {
  const byRun = new Map<string, { start: number; end: number }>();
  for (const span of doc.spans) {
    const id = span.provenance.runId;
    if (id === undefined) continue;
    const seen = byRun.get(id);
    if (seen === undefined) byRun.set(id, { start: span.start, end: span.end });
    else seen.end = span.end;
  }
  return [...byRun.values()];
}

function fullRanges(doc: Document): readonly Range[] {
  return doc.citations.flatMap((c) =>
    c.kind === "full" ? [{ start: c.citation.start, end: c.citation.end }] : [],
  );
}

const isLetter = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z]/.test(ch);

/** Offsets for the scenarios in Req 21.1 to 21.3. */
export type BenchOffsets = Readonly<{
  /** Outside every Citation range and every Run_Extent. */
  outsideAt: number;
  /** Strictly inside a Full_Citation and strictly inside a Run_Extent. */
  insideCitationAt: number;
}>;

function findOutside(doc: Document): number {
  const extents = runExtents(doc);
  const cites = fullRanges(doc);
  const firstRun = Math.min(...extents.map((e) => e.start));
  for (let o = 5_000; o < firstRun - 1; o++) {
    const letters = isLetter(doc.text[o - 1]) && isLetter(doc.text[o]) && isLetter(doc.text[o + 1]);
    if (letters && cites.every((c) => o + 1 < c.start || o > c.end)) return o;
  }
  throw new Error("Benchmark fixture has no Offset outside every Citation and Run_Extent");
}

function findInside(doc: Document): number {
  const extents = runExtents(doc);
  for (const c of fullRanges(doc)) {
    const at = c.start + 2;
    if (extents.some((e) => e.start < at && at < e.end)) return at;
  }
  throw new Error("Benchmark fixture has no Citation strictly inside a Run_Extent");
}

export type BenchFixture = Readonly<{
  document: Document;
  offsets: BenchOffsets;
  counts: DocCounts;
}>;

/** Builds the benchmark Document and asserts its counts; throws on mismatch. */
export function buildFixture(): BenchFixture {
  const rng = mulberry32(BENCH_SEED);
  const document = build(buildText(rng), cuts(rng));
  const counts = countsOf(document);
  assertCounts(counts);
  return {
    document,
    offsets: { outsideAt: findOutside(document), insideCitationAt: findInside(document) },
    counts,
  };
}
