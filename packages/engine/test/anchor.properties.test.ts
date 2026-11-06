import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { rescan } from "../src/citations/incremental";
import { extract } from "../src/citations/extract";
import { scanRange, type Match } from "../src/citations/scan";
import { apply } from "../src/document";
import {
  applyTextEdit,
  arbCitationTargetedOp,
  arbDocument,
  arbEdit,
  arbOpinionWithQuotes,
  arbTextWithCitations,
} from "../src/testing/arbitraries";
import type { Document, Extraction } from "../src/types";
import { runs } from "./support/fc";

const never = (): boolean => false;
const scan = (text: string): readonly Match[] => scanRange(text, 0, never);

/** Property 25's texts: `arbTextWithCitations` or `arbOpinionWithQuotes`. */
const arbP25Text: fc.Arbitrary<string> = fc.oneof(
  arbTextWithCitations.map((t) => t.text),
  arbOpinionWithQuotes.map((t) => t.text),
);

/** A text and one `arbEdit` of it. */
const arbTextAndEdit = arbP25Text.chain((t) => arbEdit(t).map((e) => ({ t, e })));

/** An `arbDocument` and one op from `arbCitationTargetedOp` (`arbEdit`-based). */
const arbDocAndOp = arbDocument.chain((d) => arbCitationTargetedOp(d).map((op) => ({ d, op })));

/** A Document's citation and quote layer without keys and results. */
const layerOf = (doc: Document): Extraction => ({
  citations: doc.citations.map((r) => r.citation),
  quotes: doc.quotes.map((q) => q.quote),
});

describe("Property 25: Incremental re-extraction equals full extraction _Requirements: 15.1_", () => {
  // Property 25
  it("rescan equals a full scan, and apply's citation layer equals extract(newText)", () => {
    fc.assert(
      fc.property(arbTextAndEdit, arbDocAndOp, ({ t, e }, { d, op }) => {
        const { text: next, edit } = applyTextEdit(t, e);
        expect(rescan(scan(t), edit, next)).toEqual(scan(next));
        const r = apply(d, op);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(layerOf(r.value.document)).toEqual(extract(r.value.document.text));
      }),
      runs(),
    );
  });
});
