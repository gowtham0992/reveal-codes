import { apply, createDocument, parseRecord, render, renderRecord } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import {
  ORDERS,
  STATEMENT_TITLES,
  buildDocx,
  buildStatement,
  renderStatement,
} from "@reveal-codes/export";
import type { OrderContext } from "@reveal-codes/export";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  arbDeclaration,
  arbMixedOriginDocument,
} from "../../../packages/engine/src/testing/arb-declaration";
import { readDocx } from "@reveal-codes/export";
import { recordedRecord } from "@reveal-codes/export";
import { splitExport } from "@reveal-codes/export";
import { runs } from "./support/fc.js";

const META = {
  now: new Date("2026-11-20T18:30:00.000Z"),
  verifiedAt: "2026-11-20T18:25:00.000Z",
};
const TIMESTAMP = "2026-11-20T18:00:00.000Z";

const EVERY_FILING = ORDERS.entries.find(
  (e) => e.status === "current" && e.kind === "certification_every_filing",
);
const EVERY_FILING_CONTEXT: OrderContext =
  EVERY_FILING === undefined ? null : { entry: EVERY_FILING, confidentialityCertified: false };

/** A Document of typed text only, for which the Declaration subject is this_filing. */
function typedDocument(): Document {
  const created = createDocument("", TIMESTAMP);
  if (!created.ok) throw new Error(`createDocument failed: ${created.error.kind}`);
  const typed = apply(created.value, {
    kind: "insert",
    at: 0,
    text: "The movant relies on the record.",
    provenance: { origin: "HUM", timestamp: TIMESTAMP },
  });
  if (!typed.ok) throw new Error(`apply failed: ${typed.error.kind}`);
  return typed.value.document;
}

type Case = Readonly<{
  document: Document;
  declaration: Declaration;
  context: OrderContext;
}>;

/** Either subject: pasted_text over a mixed-origin Document, this_filing over a typed one. */
const arbCase: fc.Arbitrary<Case> = fc.oneof(
  fc
    .tuple(arbMixedOriginDocument, arbDeclaration("pasted_text"))
    .map(([document, declaration]): Case => ({ document, declaration, context: null })),
  arbDeclaration("this_filing").map((declaration): Case => ({
    document: typedDocument(),
    declaration,
    context: EVERY_FILING_CONTEXT,
  })),
);

describe("the Declaration survives the record _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.12, 11.4_", () => {
  it("EVERY_FILING order exists in the shipped Order_Set", () => {
    expect(EVERY_FILING).toBeDefined();
  });

  it("regression: Tool_Name 'a[' (seed -723012165) does not appear to leak into display text holding 'alpha[PST]'", () => {
    const created = createDocument("", TIMESTAMP);
    if (!created.ok) throw new Error(`createDocument failed: ${created.error.kind}`);
    const typed = apply(created.value, {
      kind: "insert",
      at: 0,
      text: "alpha",
      provenance: { origin: "HUM", timestamp: TIMESTAMP },
    });
    if (!typed.ok) throw new Error(`apply failed: ${typed.error.kind}`);
    const pasted = apply(typed.value.document, {
      kind: "insert",
      at: 5,
      text: " beta",
      provenance: { origin: "PST", timestamp: TIMESTAMP },
    });
    if (!pasted.ok) throw new Error(`apply failed: ${pasted.error.kind}`);
    const document = pasted.value.document;
    const declaration: Declaration = {
      subject: "pasted_text",
      choice: "declared_ai",
      toolName: "a[",
    };
    const withDeclaration = renderRecord(document, declaration, "display").text;
    expect(withDeclaration).toContain("a[");
    expect(withDeclaration).toBe(renderRecord(document, null, "display").text);
    expect(withDeclaration).toBe(render(document, "display").text);
  });
  // Property 3
  it("P3 render, parse, display, no-Declaration, titles and DOCX path keep the Declaration", async () => {
    await fc.assert(
      fc.asyncProperty(arbCase, async ({ document, declaration, context }) => {
        // Full form round trip.
        const full = renderRecord(document, declaration, "full").text;
        const parsed = parseRecord(full);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.value.document).toEqual(document);
        expect(parsed.value.declaration).toEqual(declaration);

        // Display form carries no declaration text.
        const display = renderRecord(document, declaration, "display").text;
        expect(display).toBe(render(document, "display").text);
        expect(display).toBe(renderRecord(document, null, "display").text);

        // No Declaration renders as before.
        expect(renderRecord(document, null, "full")).toEqual(render(document, "full"));

        // DOCX path.
        const st = buildStatement(document, [], META, context, declaration);
        expect(st.ok).toBe(true);
        if (!st.ok) return;
        expect(st.value.declaration).toEqual(declaration);
        for (const block of renderStatement(st.value)) {
          if (block.kind === "paragraph") expect(STATEMENT_TITLES).not.toContain(block.text);
        }
        const read = readDocx(await buildDocx(document, st.value));
        expect(read.ok).toBe(true);
        if (!read.ok) return;
        const parts = splitExport(read.value);
        expect(parts.ok).toBe(true);
        if (!parts.ok) return;
        const recorded = recordedRecord(parts.value.appendix);
        expect(recorded.ok).toBe(true);
        if (!recorded.ok) return;
        expect(recorded.value.document).toEqual(document);
        expect(recorded.value.declaration).toEqual(declaration);
      }),
      { numRuns: runs(process.env) },
    );
  }, 600_000);
});
