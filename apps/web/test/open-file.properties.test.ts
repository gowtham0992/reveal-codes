import { docxSafe, holdsDocxUnsafe } from "@reveal-codes/export";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeTextFile } from "../src/client/open-text";
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
