import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { segment } from "../src/segment";
import { checkCoverage, normaliseSpans } from "../src/spans";
import {
  arbLabelling,
  arbSpanCorruption,
  arbSpanFragmentation,
  arbText,
} from "../src/testing/arbitraries";
import type { Provenance, Span } from "../src/types";
import { runs } from "./support/fc";

/**
 * Test-local Mergeable key (Glossary): Origin plus Run_Id, distinguishing an
 * absent Run_Id from any present one. Timestamps play no part.
 */
const labelKey = (p: Provenance): string =>
  Object.prototype.hasOwnProperty.call(p, "runId")
    ? `${p.origin}\u0000${String(p.runId)}`
    : p.origin;

type Unit = Readonly<{ label: string; timestamp: string }>;

/**
 * Reference model for Req 3.3 and 3.5: one entry per code unit, carrying the
 * input label and the Timestamp of the lowest-start input span in the
 * maximal run of adjacent same-label spans that contains it.
 */
function expectedUnits(spans: readonly Span[]): readonly Unit[] {
  const units: Unit[] = [];
  let runLabel: string | null = null;
  let runTimestamp = "";
  for (const s of spans) {
    const label = labelKey(s.provenance);
    if (label !== runLabel) {
      runLabel = label;
      runTimestamp = s.provenance.timestamp;
    }
    for (let i = s.start; i < s.end; i++) units.push({ label, timestamp: runTimestamp });
  }
  return units;
}

/** What the output says at each code unit: its label and its own Timestamp. */
function actualUnits(spans: readonly Span[]): readonly Unit[] {
  const units: Unit[] = [];
  for (const s of spans) {
    const unit = { label: labelKey(s.provenance), timestamp: s.provenance.timestamp };
    for (let i = s.start; i < s.end; i++) units.push(unit);
  }
  return units;
}

const arbTextAndFragmentation = arbText.chain((text) =>
  arbSpanFragmentation(text).map((spans) => ({ text, spans })),
);

describe("normaliseSpans _Requirements: 3.3, 3.4, 3.5_", () => {
  // Property 3
  it("merges exactly the Mergeable runs, keeps per-unit provenance, and is idempotent", () => {
    fc.assert(
      fc.property(arbTextAndFragmentation, ({ text, spans }) => {
        const once = normaliseSpans(text.length, spans);
        if (!once.ok) throw new Error(`valid fragmentation rejected: ${JSON.stringify(once)}`);
        const out = once.value;

        expect(checkCoverage(text.length, out).ok).toBe(true);
        out.slice(1).forEach((s, i) => {
          const prev = out[i];
          expect(prev && labelKey(prev.provenance)).not.toBe(labelKey(s.provenance));
        });
        expect(actualUnits(out)).toStrictEqual(expectedUnits(spans));

        const twice = normaliseSpans(text.length, out);
        expect(twice).toStrictEqual({ ok: true, value: out });
      }),
      runs(),
    );
  });
});

/** A span's place and label, without its Timestamp (Req 3.7 compares only these). */
const shapeOf = (spans: readonly Span[]): readonly string[] =>
  spans.map((s) => `${String(s.start)}:${String(s.end)}:${labelKey(s.provenance)}`);

function canonicalShape(length: number, spans: readonly Span[]): readonly string[] {
  const r = normaliseSpans(length, spans);
  if (!r.ok) throw new Error(`valid span list rejected: ${JSON.stringify(r)}`);
  return shapeOf(r.value);
}

const arbTwoFragmentations = arbText.chain((text) =>
  arbLabelling(text).chain((labelling) =>
    fc
      .tuple(arbSpanFragmentation(text, labelling), arbSpanFragmentation(text, labelling))
      .map(([a, b]) => ({ text, labelling, a, b })),
  ),
);

describe("normaliseSpans canonical form _Requirements: 3.7_", () => {
  // Property 4
  it("gives the same starts, ends, Origins and Run_Ids for any two fragmentations of one labelling", () => {
    fc.assert(
      fc.property(arbTwoFragmentations, ({ text, labelling, a, b }) => {
        const expected = canonicalShape(text.length, labelling);
        expect(canonicalShape(text.length, a)).toStrictEqual(expected);
        expect(canonicalShape(text.length, b)).toStrictEqual(expected);
      }),
      runs(),
    );
  });
});

describe("invalid span lists _Requirements: 3.6, 8.9_", () => {
  // Property 5
  it("normaliseSpans and segment both return invalid_spans at the recorded first violation", () => {
    fc.assert(
      fc.property(arbSpanCorruption, ({ text, spans, expected }) => {
        const rejected = { ok: false, error: expected };
        expect(normaliseSpans(text.length, spans)).toStrictEqual(rejected);
        expect(segment(text, spans)).toStrictEqual(rejected);
      }),
      runs(),
    );
  });
});
