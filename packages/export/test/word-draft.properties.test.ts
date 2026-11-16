import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Declaration, Document } from "@reveal-codes/engine";
import { arbDeclaration } from "../../engine/src/testing/arb-declaration.js";
import { arbDocument } from "../../engine/src/testing/arb-document.js";
import {
  ORDERS,
  applicableDeclaration,
  canExport,
  declarationSubject,
  readDocx,
  recordedDocument,
  splitExport,
} from "../src/index.js";
import type { OrderContext, OrderEntry, RunInfo } from "../src/index.js";
import { applyBodyEdit, arbBodyEdit, arbRunLog, runs } from "./support/arbitraries.js";
import { withParagraphText } from "./support/body-edit.js";
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

const arbChangedExport = arbRoundTrip.chain((c) =>
  arbBodyEdit(c.document.text.split("\n")).map((edit) => ({ c, edit })),
);

/**
 * The Sentinel's body_edited rule, run through the same shared readers `analyseFile` calls
 * (crew/sentinel/src/analyse.ts and findings.ts): the body paragraphs joined with "\n" differ
 * from the text recorded in the Appendix. analyseFile itself cannot be imported here: the Sentinel
 * test project references this one, so a reference back would be a cycle.
 */
function sentinelEdited(bytes: Uint8Array): boolean {
  const read = readDocx(bytes);
  if (!read.ok) throw new Error("the exported file is not readable");
  const parts = splitExport(read.value);
  if (!parts.ok) throw new Error("the exported file has no statement and appendix");
  const recorded = recordedDocument(parts.value.appendix);
  if (!recorded.ok) throw new Error("the exported appendix is not readable");
  return parts.value.body.join("\n") !== recorded.value.text;
}

describe("a changed export imports as pasted body text _Requirements: 9.9, 10.1, 10.2, 10.5, 10.6, 10.7, 18.5_", () => {
  // Property 3
  it("P3 a one-character body change reads as changed text, and the Sentinel agrees", async () => {
    await fc.assert(
      fc.asyncProperty(arbChangedExport, async ({ c, edit }) => {
        const options = {
          runLog: c.runLog,
          verifiedAt: c.verifiedAt,
          orderContext: c.orderContext,
          declaration: applicableDeclaration(
            c.document,
            c.orderContext === null ? null : c.orderContext.entry,
            c.declaration,
          ),
        };
        const original = await exportBytes(c.document, options);
        const paragraphs = c.document.text.split("\n");
        const changed = applyBodyEdit(paragraphs, edit);
        const edited = withParagraphText(original, edit.paragraph, changed[edit.paragraph] ?? "");

        const draft = reopen(edited);
        expect(draft).toEqual({ kind: "changed", text: changed.join("\n") });
        expect(changed.join("\n")).not.toBe(c.document.text);
        // The draft carries the changed text and nothing else: no Declaration, no spans, no Appendix data.
        expect(Object.keys(draft).sort()).toEqual(["kind", "text"]);

        const unchanged = reopen(original);
        expect(sentinelEdited(edited)).toBe(draft.kind === "changed");
        expect(sentinelEdited(original)).toBe(unchanged.kind === "changed");
      }),
      { numRuns: runs() },
    );
  });
});
