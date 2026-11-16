import type { Document } from "@reveal-codes/engine";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canExport } from "../src/index.js";
import { arbAnyEntry, arbGateClearAiDocument, runs } from "./support/arbitraries.js";

function hasAiOrigin(document: Document): boolean {
  return document.spans.some(
    (s) => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM",
  );
}

describe("order gate _Requirements: 5.2, 5.3, 5.4, 5.12, 10.3_", () => {
  // Property 2
  // Feature: court-orders, Property 2: Gate
  it("P2 canExport is false exactly for a prohibition with AI-origin text on a gate-clear document", () => {
    fc.assert(
      fc.property(arbGateClearAiDocument, arbAnyEntry, (document, entry) => {
        expect(canExport(document, entry, null)).toBe(
          !(entry.kind === "prohibition" && hasAiOrigin(document)),
        );
      }),
      { numRuns: runs() },
    );
  });
});
