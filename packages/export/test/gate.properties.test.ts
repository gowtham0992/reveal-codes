import { blockingIssues } from "@reveal-codes/engine";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canExport } from "../src/index.js";
import { arbGateDocument, runs } from "./support/arbitraries.js";

describe("gate _Requirements: 1.1, 1.2, 1.6_", () => {
  // Property 1
  it("P1 canExport is true exactly when no blocking issue remains", () => {
    fc.assert(
      fc.property(arbGateDocument, ({ doc, clear }) => {
        const before = structuredClone(doc);
        const first = canExport(doc, null, null);
        expect(first).toBe(blockingIssues(doc).length === 0);
        if (clear) expect(first).toBe(true);
        expect(canExport(doc, null, null)).toBe(first);
        expect(doc).toEqual(before);
      }),
      { numRuns: runs() },
    );
  });
});
