import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkCoverage, normaliseSpans } from "../src/spans";
import { arbSpanFragmentation, arbText } from "../src/testing/arbitraries";
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
