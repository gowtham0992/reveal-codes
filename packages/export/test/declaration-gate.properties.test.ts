import { apply, blockingIssues, createDocument } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbDeclaration, arbMixedOriginDocument } from "../../engine/src/testing/arb-declaration";
import { ORDERS, canExport } from "../src/index.js";
import type { OrderEntry } from "../src/index.js";
import { arbAnyEntry, arbGateClearAiDocument, runs } from "./support/arbitraries.js";

const NON_SPACE = /[^\p{White_Space}]/u;

/** Expected AI use, computed from spans, text and the declaration subject only. */
function expectedUsedAi(
  document: Document,
  entry: OrderEntry,
  stored: Declaration | null,
): boolean {
  const hasAi = document.spans.some(
    (s) => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM",
  );
  if (hasAi) return true;
  const hasPasted = document.spans.some(
    (s) => s.provenance.origin === "PST" && NON_SPACE.test(document.text.slice(s.start, s.end)),
  );
  const statementRequired =
    entry.kind === "certification_every_filing" ||
    entry.elements.includes("negative_certification_when_unused");
  const subject = hasPasted ? "pasted_text" : statementRequired ? "this_filing" : null;
  return subject !== null && stored?.subject === subject && stored.choice === "declared_ai";
}

const arbClearDocument: fc.Arbitrary<Document> = fc.oneof(
  arbGateClearAiDocument,
  arbMixedOriginDocument.filter((d) => blockingIssues(d).length === 0),
);

describe("declaration gate _Requirements: 6.2, 6.3, 6.4, 6.9, 6.10, 11.3_", () => {
  // Property 2
  it("P2 canExport is false exactly when the entry prohibits and AI was used", () => {
    fc.assert(
      fc.property(
        arbClearDocument,
        arbAnyEntry,
        fc.option(arbDeclaration(), { nil: null }),
        (document, entry, stored) => {
          expect(blockingIssues(document)).toHaveLength(0);
          const expected = !(
            entry.kind === "prohibition" && expectedUsedAi(document, entry, stored)
          );
          expect(canExport(document, entry, stored)).toBe(expected);
        },
      ),
      { numRuns: runs() },
    );
  }, 120_000);
});

describe("declaration gate examples _Requirements: 6.10_", () => {
  const prohibition = ORDERS.entries.find((e) => e.kind === "prohibition");
  const TS = "2026-11-20T18:25:00.000Z";

  function pastedOnlyDocument(): Document {
    const start = createDocument("", TS);
    if (!start.ok) throw new Error("createDocument failed");
    const inserted = apply(start.value, {
      kind: "insert",
      at: 0,
      text: "Pasted words from elsewhere.",
      provenance: { origin: "PST", timestamp: TS },
    });
    if (!inserted.ok) throw new Error("insert failed");
    return inserted.value.document;
  }

  it("changing Declared_AI to None makes canExport true when no Assistant_Text remains", () => {
    if (prohibition === undefined) throw new Error("no prohibition entry shipped");
    const doc = pastedOnlyDocument();
    const declared: Declaration = {
      subject: "pasted_text",
      choice: "declared_ai",
      toolName: "ChatGPT",
    };
    const none: Declaration = { subject: "pasted_text", choice: "none" };
    expect(canExport(doc, prohibition, declared)).toBe(false);
    expect(canExport(doc, prohibition, none)).toBe(true);
  });

  it("a Declared_AI of the wrong subject does not count", () => {
    if (prohibition === undefined) throw new Error("no prohibition entry shipped");
    const wrong: Declaration = {
      subject: "this_filing",
      choice: "declared_ai",
      toolName: "ChatGPT",
    };
    expect(canExport(pastedOnlyDocument(), prohibition, wrong)).toBe(true);
  });
});
