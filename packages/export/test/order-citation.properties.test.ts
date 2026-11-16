import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STATEMENT_TITLE, buildStatement, renderStatement } from "../src/index.js";
import type { StatementBlock } from "../src/index.js";
import { arbExportCase, arbOrderContext, runs } from "./support/arbitraries.js";
import { declarationFor } from "./support/declarations.js";

/** Every block's text, joined with newlines. */
function joinedText(blocks: readonly StatementBlock[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.kind === "title" || b.kind === "paragraph") parts.push(b.text);
    else if (b.kind === "table") parts.push(...b.columns, ...b.rows.flat());
    else parts.push(b.line, b.date);
  }
  return parts.join("\n");
}

describe("Order citation is total  _Requirements: 4.5, 4.6, 4.7, 10.2_", () => {
  // Property 1
  // Feature: court-orders, Property 1: Order citation is total
  it("P1 the Statement_Text cites the instrument, court and source, and titles by caption placement", () => {
    fc.assert(
      fc.property(arbExportCase, arbOrderContext, (c, context) => {
        const built = buildStatement(
          c.document,
          c.runLog,
          c.meta,
          context,
          declarationFor(c.document, context === null ? null : context.entry),
        );
        if (!built.ok) throw new Error(`buildStatement failed: ${built.error.kind}`);
        const blocks = renderStatement(built.value);
        const title = blocks[0];
        expect(title?.kind).toBe("title");
        if (title?.kind !== "title") return;
        if (context === null) {
          expect(title.text).toBe(STATEMENT_TITLE);
          expect(built.value.order).toBeNull();
          // No citing paragraph: the numbered paragraphs are the five (six with overrides) of today.
          const numbers = blocks.flatMap((b) => (b.kind === "paragraph" ? [b.number] : []));
          const total = built.value.overrides.length > 0 ? 6 : 5;
          expect(numbers).toEqual(Array.from({ length: total }, (_, i) => i + 1));
          return;
        }
        const { entry } = context;
        const text = joinedText(blocks);
        const first = blocks[1];
        expect(first?.kind).toBe("paragraph");
        const para1 = first?.kind === "paragraph" ? first : null;
        expect(para1?.number).toBe(1);
        for (const needle of [entry.instrument, entry.court.name, entry.source_url]) {
          expect(text).toContain(needle);
          expect(para1?.text).toContain(needle);
        }
        const placement = entry.caption?.placement;
        const captioned = placement === "statement_title" || placement === "separate_declaration";
        expect(title.text).toBe(captioned && entry.caption ? entry.caption.text : STATEMENT_TITLE);
      }),
      { numRuns: runs() },
    );
  });
});
