import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDocx, buildStatement } from "../src/index.js";
import { arbExportCase } from "./support/arbitraries.js";
import { declarationFor } from "./support/declarations.js";
import { readDocxParagraphs } from "./support/docx-text.js";

const INTRO =
  "The following is the complete provenance record of this filing in Reveal Codes form.";

describe("docx content _Requirements: 6.3, 6.4, 6.9, 6.10_", () => {
  // Property 4
  it("P4 the docx holds the filing, the Statement and the Appendix in order", async () => {
    // numRuns is low because packing a docx file is slow.
    await fc.assert(
      fc.asyncProperty(arbExportCase, async ({ document, runLog, meta }) => {
        const built = buildStatement(document, runLog, meta, null, declarationFor(document, null));
        expect(built.ok).toBe(true);
        if (!built.ok) return;
        const paras = readDocxParagraphs(await buildDocx(document, built.value));
        const marks = paras.flatMap((p, i) => (p === "\f" ? [i] : []));
        expect(marks).toHaveLength(2);
        const [m1, m2] = marks as [number, number];
        expect(paras.slice(0, m1)).toEqual(document.text.split("\n"));
        expect(paras[m1 + 1]).toBe("AI-Use and Verification Statement");
        expect(
          paras[m1 + 2]?.startsWith(
            "1. This filing was prepared with the drafting tool Reveal Codes",
          ),
        ).toBe(true);
        expect(paras[m2 + 1]).toBe("Provenance Appendix");
        expect(paras[m2 + 2]).toBe(INTRO);
      }),
      { numRuns: 50 },
    );
  });
});
