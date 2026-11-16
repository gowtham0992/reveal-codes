import { docxSafe, holdsDocxUnsafe } from "@reveal-codes/export";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { removedSentence } from "../src/client/open-messages";
import { textOutcome } from "../src/client/open-outcome";
import { decodeTextFile } from "../src/client/open-text";
import { pastedDocument } from "../src/client/pasted-document";
import { initialState, reduce } from "../src/store";
import { runs } from "./support/fc";

const BOM_BYTES = [0xef, 0xbb, 0xbf];

/** Any Unicode text with no `\r` and no Docx_Unsafe_Character (so every string is valid UTF-8). */
const arbCleanText: fc.Arbitrary<string> = fc
  .string({ unit: "binary", maxLength: 80 })
  .map((s) => docxSafe(s).text.replace(/\r/g, ""))
  .filter((s) => !holdsDocxUnsafe(s));

/** A non-empty line with no `\r` or `\n`: the separators are the only line breaks, and an empty line cannot make `\r` and `\n` merge. */
const arbLine: fc.Arbitrary<string> = arbCleanText
  .map((s) => s.replace(/\n/g, ""))
  .filter((s) => s.length > 0);

const arbSeparator = fc.constantFrom("\r\n", "\r", "\n");

function encode(text: string, withBom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  return withBom ? Uint8Array.from([...BOM_BYTES, ...body]) : body;
}

describe("open-file: UTF-8 text round trip _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_", () => {
  // Property 10
  it("P10 decodeTextFile returns the string with or without a BOM, and turns \\r\\n and \\r into \\n", () => {
    fc.assert(
      fc.property(
        arbCleanText,
        fc.array(arbLine, { minLength: 1, maxLength: 6 }),
        fc.array(arbSeparator, { minLength: 6, maxLength: 6 }),
        fc.boolean(),
        (text, lines, separators, withBom) => {
          expect(decodeTextFile(encode(text, withBom))).toEqual({ ok: true, value: text });

          const raw = lines.reduce(
            (acc, line, i) => (i === 0 ? line : acc + (separators[i - 1] ?? "\n") + line),
            "",
          );
          expect(decodeTextFile(encode(raw, withBom))).toEqual({
            ok: true,
            value: lines.join("\n"),
          });
        },
      ),
      { numRuns: runs() },
    );
  });
});

/** Text with Docx_Unsafe_Characters mixed in (binary units cover the C0 controls) and a Unicode tail. */
const arbOpenedRaw: fc.Arbitrary<string> = fc
  .tuple(fc.string({ unit: "binary", maxLength: 60 }), fc.string({ maxLength: 40 }))
  .map(([a, b]) => `${a}${b}`);

const NOW = new Date("2026-11-07T12:00:00.000Z");

describe("open-file: opened text installs as one PST span _Requirements: 8.1, 8.2, 8.6, 22.3, 22.5_", () => {
  // Property 11
  it("P11 an accepted text installs as one PST span after docxSafe, with a clean Store and the removed sentence", () => {
    fc.assert(
      fc.property(arbOpenedRaw, (raw) => {
        const outcome = textOutcome("draft.txt", raw, { notes: false, note: null });
        fc.pre(outcome.kind === "text");
        const safe = docxSafe(raw);
        expect(outcome.text).toBe(safe.text);
        expect(outcome.removed).toBe(safe.removed);
        expect(outcome.notice.includes(removedSentence(safe.removed))).toBe(true);
        expect(outcome.notice.includes("removed")).toBe(safe.removed >= 1);
        if (safe.removed >= 1) expect(outcome.notice).toContain(String(safe.removed));

        const iso = NOW.toISOString();
        const doc = pastedDocument(outcome.text, iso);
        expect(typeof doc).not.toBe("string");
        if (typeof doc === "string") return;
        const { state } = reduce(
          initialState(() => NOW),
          { type: "replace", document: doc, runLog: [], verifiedAt: null, declaration: null },
          () => NOW,
        );
        expect(state.document.text).toBe(safe.text);
        expect(state.document.spans).toEqual([
          { start: 0, end: safe.text.length, provenance: { origin: "PST", timestamp: iso } },
        ]);
        expect(state.document.runs).toEqual([]);
        expect(state.document.overrides).toEqual([]);
        expect(state.document.quotes.every((q) => q.result.status === "unchecked")).toBe(true);
        expect(
          state.document.citations.every(
            (c) => c.kind !== "full" || c.result.status === "unchecked",
          ),
        ).toBe(true);
        expect(state.declaration).toBeNull();
        expect(state.runLog).toEqual([]);
        expect(state.verifiedAt).toBeNull();
      }),
      { numRuns: runs() },
    );
  });
});
