import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Declaration, Document } from "@reveal-codes/engine";
import { arbDeclaration } from "../../engine/src/testing/arb-declaration.js";
import { arbDocument } from "../../engine/src/testing/arb-document.js";
import { ORDERS, applicableDeclaration, canExport, declarationSubject } from "../src/index.js";
import type { OrderContext, OrderEntry, RunInfo } from "../src/index.js";
import { arbRunLog, runs } from "./support/arbitraries.js";
import { compareRestored, exportBytes, reopen } from "./support/restore.js";

const CERTIFYING: readonly OrderEntry[] = ORDERS.entries.filter(
  (e) => e.status === "current" && e.kind === "certification_every_filing",
);

type RoundTrip = Readonly<{
  document: Document;
  runLog: readonly RunInfo[];
  verifiedAt: string | null;
  orderContext: OrderContext;
  declaration: Declaration | null;
}>;

/**
 * The Applicable_Declaration rule: a pasted_text Declaration when the Document holds substantive pasted
 * text; a this_filing Declaration when a certifying order is chosen and the Document has neither
 * assistant text nor substantive pasted text; otherwise none applies.
 */
const arbRoundTrip: fc.Arbitrary<RoundTrip> = fc
  .tuple(
    arbDocument,
    fc.boolean(),
    fc.constantFrom(...CERTIFYING),
    arbDeclaration("pasted_text"),
    arbDeclaration("this_filing"),
    fc.option(
      fc.date({
        min: new Date("2000-01-01T00:00:00.000Z"),
        max: new Date("2100-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      }),
      { nil: null },
    ),
  )
  .chain(([document, withOrder, entry, pasted, filing, verified]) => {
    const orderContext: OrderContext = withOrder
      ? { entry, confidentialityCertified: false }
      : null;
    const subject = declarationSubject(document, orderContext === null ? null : entry);
    const declaration =
      subject === "pasted_text" ? pasted : subject === "this_filing" ? filing : null;
    return arbRunLog(document).map((runLog): RoundTrip => ({
      document,
      runLog,
      verifiedAt: verified === null ? null : verified.toISOString(),
      orderContext,
      declaration,
    }));
  });

describe("a reopened export is the exported Document _Requirements: 9.2, 9.3, 9.7, 9.10, 12.1, 12.5, 13.8, 18.4_", () => {
  // Property 2
  it("P2 readWordDraft of an export is restored, with the same Document, Declaration and gate", async () => {
    await fc.assert(
      fc.asyncProperty(arbRoundTrip, async (c) => {
        const entry = c.orderContext === null ? null : c.orderContext.entry;
        const expected = applicableDeclaration(c.document, entry, c.declaration);
        const bytes = await exportBytes(c.document, {
          runLog: c.runLog,
          verifiedAt: c.verifiedAt,
          orderContext: c.orderContext,
          declaration: c.declaration,
        });
        const result = compareRestored(reopen(bytes), c.document, expected);
        expect(result.draft.kind).toBe("restored");
        expect(result.documentEqual).toBe(true);
        expect(result.declarationEqual).toBe(true);
        if (result.draft.kind !== "restored") return;
        const restored = result.draft.record;
        for (const order of [null, ...ORDERS.entries]) {
          expect(canExport(restored.document, order, restored.declaration)).toBe(
            canExport(c.document, order, expected),
          );
        }
      }),
      { numRuns: runs() },
    );
  });
});
