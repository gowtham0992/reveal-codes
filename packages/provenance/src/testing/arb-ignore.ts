/**
 * Ignore-file and path arbitraries (Property 15). Built only from fast-check combinators, so
 * every value shrinks. Segment names come from a small alphabet so that patterns and paths
 * meet often.
 */
import fc from "fast-check";
/** Segment names of generated paths. */
const NAMES = ["a", "b", "ab", ".x", "x y"] as const;
const arbName: fc.Arbitrary<string> = fc.constantFrom(...NAMES);
/** One piece of a segment pattern: a literal, a wildcard, a class or an escape. */
const arbToken: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom("a", "b", ".", "x", " ", "y") },
  { weight: 2, arbitrary: fc.constantFrom("ab", ".x", "x y") },
  { weight: 3, arbitrary: fc.constant("*") },
  { weight: 2, arbitrary: fc.constant("?") },
  {
    weight: 3,
    arbitrary: fc.constantFrom(
      "[ab]",
      "[a-b]",
      "[!a]",
      "[^a]",
      "[!a-b]",
      "[[:alpha:]]",
      "[[:space:]]",
      "[]a]",
      "[a-]",
      "[a",
    ),
  },
  { weight: 2, arbitrary: fc.constantFrom("\\*", "\\?", "\\[", "\\a", "\\ ", "\\\\") },
  { weight: 1, arbitrary: fc.constantFrom("**", "***") },
);
const arbSegment: fc.Arbitrary<string> = fc
  .array(arbToken, { minLength: 1, maxLength: 3 })
  .map((tokens) => tokens.join(""));
/** A pattern body: segments joined by `/`, with `**` forms between them. */
const arbBody: fc.Arbitrary<string> = fc
  .array(
    fc.oneof(
      { weight: 5, arbitrary: arbSegment },
      { weight: 3, arbitrary: arbName },
      { weight: 2, arbitrary: fc.constant("**") },
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((segments) => segments.join("/"));
/** A pattern line: optional `!`, optional anchoring and directory-only slashes, trailing spaces. */
const arbPatternLine: fc.Arbitrary<string> = fc
  .tuple(
    fc.boolean(),
    fc.constantFrom("", "", "/"),
    arbBody,
    fc.constantFrom("", "", "/"),
    fc.constantFrom("", "", "", " ", "  ", "\\ "),
  )
  .map(
    ([negated, lead, body, trail, spaces]) =>
      `${negated ? "!" : ""}${lead}${body}${trail}${spaces}`,
  );
const arbOtherLine: fc.Arbitrary<string> = fc.constantFrom(
  "",
  "",
  "# a",
  "#a",
  "\\#a",
  "\\!a",
  "\\!b/",
  "  ",
  "/",
  "!",
);
const arbLine: fc.Arbitrary<string> = fc.oneof(
  { weight: 9, arbitrary: arbPatternLine },
  { weight: 2, arbitrary: arbOtherLine },
);
/** The text of an ignore file: lines of comments, blanks and patterns. */
export const arbIgnoreContents: fc.Arbitrary<string> = fc
  .tuple(fc.array(arbLine, { minLength: 0, maxLength: 6 }), fc.boolean())
  .map(([lines, finalNewline]) => lines.join("\n") + (finalNewline ? "\n" : ""));
const arbRawPath: fc.Arbitrary<string> = fc
  .array(arbName, { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("/"));
/**
 * Drops each path that is a directory of another kept path, so that all of them can exist in
 * one file system: a name cannot be a file and a directory at once.
 */
function consistent(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)];
  return unique.filter((p) => !unique.some((q) => q.startsWith(`${p}/`)));
}
/** A set of file paths of one to four segments that can all be created in one directory. */
export const arbIgnorePaths: fc.Arbitrary<string[]> = fc
  .array(arbRawPath, { minLength: 1, maxLength: 12 })
  .map(consistent)
  .filter((paths) => paths.length > 0);
