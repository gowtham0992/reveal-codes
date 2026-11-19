/**
 * File text, line and path arbitraries (Req 16.14). Built only from fast-check
 * combinators, so every value shrinks. Only `src/testing/` imports fast-check.
 */
import fc from "fast-check";

const ASCII = fc.integer({ min: 0x20, max: 0x7e }).map((u) => String.fromCharCode(u));
const SPECIAL = fc.constantFrom("[", "]", "\\", "\t");
const ASTRAL = fc.integer({ min: 0x10000, max: 0x10ffff }).map((cp) => String.fromCodePoint(cp));

/** One character of a line: mostly ASCII, with the Codes syntax characters, a tab and astral characters. */
const lineChar: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: ASCII },
  { weight: 1, arbitrary: SPECIAL },
  { weight: 1, arbitrary: ASTRAL },
);

/** One line without a line terminator (no `\n`, no `\r`). */
export const arbLine: fc.Arbitrary<string> = fc
  .array(lineChar, { maxLength: 24 })
  .map((chars) => chars.join(""));

/** A line array: the lines of a text, without terminators. May be empty. */
export const arbLines: fc.Arbitrary<string[]> = fc.array(arbLine, { maxLength: 8 });

const BOM = "\uFEFF";
const join = (lines: readonly string[], eol: string): string => lines.join(eol);
const nonEmptyLines = fc.array(arbLine, { minLength: 1, maxLength: 8 });

const eolArb = fc.constantFrom("\n", "\r\n");

/** Text with a leading byte order mark. */
export const arbTextWithBom: fc.Arbitrary<string> = fc
  .tuple(arbLines, eolArb)
  .map(([lines, eol]) => BOM + join(lines, eol));

/** Text whose line ends are `\r\n` and which contains at least one. */
export const arbTextWithCrlf: fc.Arbitrary<string> = fc
  .tuple(arbLines, arbLine)
  .map(([lines, last]) => join([...lines, last], "\r\n") + "\r\n");

/** Text with at least one surrogate pair (an astral character). */
export const arbTextWithSurrogatePair: fc.Arbitrary<string> = fc
  .tuple(arbLine, ASTRAL, arbLine)
  .map(([a, c, b]) => `${a}${c}${b}`);

/** Text with at least one `[`, one `]` and one `\`. */
export const arbTextWithCodesSyntax: fc.Arbitrary<string> = fc
  .tuple(arbLine, arbLine, arbLine, arbLine)
  .map(([a, b, c, d]) => `${a}[${b}]${c}\\${d}`);

/** Text with a line of 1,000 to 3,000 characters. */
export const arbTextWithLongLine: fc.Arbitrary<string> = fc
  .tuple(arbLines, fc.integer({ min: 1000, max: 3000 }), arbLines)
  .map(([before, n, after]) => join([...before, "x".repeat(n), ...after], "\n"));

/** Non-empty text whose last character is not a line terminator. */
export const arbTextNoFinalNewline: fc.Arbitrary<string> = fc
  .tuple(
    nonEmptyLines,
    ASCII.filter((c) => c !== "\n" && c !== "\r"),
  )
  .map(([lines, tail]) => join(lines, "\n") + "\n" + tail);

/** File text of any of the shapes above, empty text, or plain text with `\n` ends. */
export const arbFileText: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  arbLines.map((lines) => join(lines, "\n")),
  arbLines.map((lines) => join(lines, "\n") + "\n"),
  arbTextWithBom,
  arbTextWithCrlf,
  arbTextWithSurrogatePair,
  arbTextWithCodesSyntax,
  arbTextWithLongLine,
  arbTextNoFinalNewline,
);

const SEGMENT_CHAR = fc.constantFrom(..."abcxyz019_-. \u00e9".split(""));
const arbSegment: fc.Arbitrary<string> = fc
  .array(SEGMENT_CHAR, { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(""))
  .filter((s) => s !== "." && s !== ".." && s.trim() === s);

/** A repository-relative path of one to four segments: no `..` segment, no leading `/`, no NUL. */
export const arbPath: fc.Arbitrary<string> = fc
  .array(arbSegment, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("/"));
