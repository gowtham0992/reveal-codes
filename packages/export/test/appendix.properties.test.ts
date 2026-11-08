import * as fc from "fast-check";
import { parse, render } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildAppendix } from "../src/index.js";
import { runs } from "./support/arbitraries.js";
import { arbDocument } from "../../engine/src/testing/arb-document";

describe("appendix round trip _Requirements: 5.2, 5.3, 5.4_", () => {
  // Property 3
  it("P3 appendix lines join to the full rendering and parse back to the same Document", () => {
    fc.assert(
      fc.property(arbDocument, (document) => {
        const before = structuredClone(document);
        const appendix = buildAppendix(document);
        const text = appendix.lines.join("\n");
        expect(text).toBe(render(document, "full").text);

        const parsed = parse(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.text).toEqual(document.text);
        expect(parsed.value.spans).toEqual(document.spans);
        expect(parsed.value.citations).toEqual(document.citations);
        expect(parsed.value.quotes).toEqual(document.quotes);
        expect(parsed.value.overrides).toEqual(document.overrides);
        expect(parsed.value.runs).toEqual(document.runs);

        expect(buildAppendix(document)).toEqual(appendix);
        expect(document).toEqual(before);
      }),
      { numRuns: runs() },
    );
  });
});
