import * as fc from "fast-check";

// ---- Property 13 harness: cluster ids of digits and near-digits, and absolute URLs of every shape. ----

export const ORIGIN = "https://www.courtlistener.com";
export const arbDigitId = fc.stringMatching(/^[0-9]{1,12}$/);
/** Strings that look like ids but are not ASCII digits only: empty, signs, spaces, newlines, non-ASCII digits. */
export const arbNonDigitId: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    "",
    " ",
    "-1",
    "+1",
    "1.5",
    "1e3",
    "١٢٣",
    "１２３",
    "12\n",
    "\n12",
    "1 2",
    "0x1f",
  ),
  fc.tuple(arbDigitId, fc.constantFrom("a", " ", "\n", "/", "-", "١")).map(([d, x]) => d + x),
  fc.tuple(fc.constantFrom("a", " ", "\n", "/", "-", "١"), arbDigitId).map(([x, d]) => x + d),
  fc.string({ maxLength: 10 }).filter((s) => !/^[0-9]+$/.test(s)),
);
export const arbLinkId: fc.Arbitrary<string> = fc.oneof(arbDigitId, arbNonDigitId);
/** Site-relative paths (one leading slash), protocol-relative and absolute URLs, other strings, and undefined. */
export const arbLinkUrl: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constantFrom<string | undefined>(
    undefined,
    "",
    "/",
    "//",
    "//evil.example/x",
    "http://evil.example/x",
    "https://evil.example/",
    "opinion/1/x/",
    "\\\\evil.example",
  ),
  fc.string({ maxLength: 16 }).map((s) => `/${s}`),
  fc.string({ maxLength: 16 }).map((s) => `//${s}`),
  fc.string({ maxLength: 16 }),
);
