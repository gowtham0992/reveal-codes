/**
 * Task name, time and collision arbitraries (Property 10). Built only from
 * fast-check combinators, so every value shrinks. Only `src/testing/` imports fast-check.
 */
import fc from "fast-check";

const ASCII = fc.integer({ min: 0x20, max: 0x7e }).map((u) => String.fromCharCode(u));
const CONTROL = fc.oneof(
  fc.integer({ min: 0, max: 0x1f }).map((u) => String.fromCharCode(u)),
  fc.integer({ min: 0x7f, max: 0x9f }).map((u) => String.fromCharCode(u)),
);
const SPACING = fc.constantFrom(" ", "  ", "\u00a0", "\u2028", "\u3000");
const SYNTAX = fc.constantFrom("[", "]", "\\", ".", "~", "-", ":", "T", "Z", "0", "9");
const ASTRAL = fc.integer({ min: 0x10000, max: 0x10ffff }).map((cp) => String.fromCodePoint(cp));
const TIME_LIKE = fc.constantFrom(" 2026-11-18T10:20:30Z", " 2026-11-18T10:20:30Z~2.7", "~3.4");

const titleChar: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: ASCII },
  { weight: 2, arbitrary: SYNTAX },
  { weight: 2, arbitrary: SPACING },
  { weight: 1, arbitrary: CONTROL },
  { weight: 1, arbitrary: ASTRAL },
  { weight: 1, arbitrary: TIME_LIKE },
);

/** Title text: up to 120 characters, so some are cut at 80 code points. */
const arbTitleText: fc.Arbitrary<string> = fc
  .array(titleChar, { maxLength: 120 })
  .map((chars) => chars.join(""));

const arbNumber: fc.Arbitrary<string> = fc
  .tuple(
    fc.nat({ max: 99 }),
    fc.array(fc.nat({ max: 99 }), { maxLength: 3 }),
    fc.constantFrom("", "."),
  )
  .map(([first, rest, dot]) => [first, ...rest].join(".") + dot);

/** A `task_name`: with or without a leading Task_Number, any separator, any title text. */
export const arbTaskName: fc.Arbitrary<string> = fc.oneof(
  arbTitleText,
  fc
    .tuple(
      fc.constantFrom("", " ", "\t"),
      arbNumber,
      fc.constantFrom("", " ", "  ", "\n"),
      arbTitleText,
    )
    .map(([lead, number, gap, title]) => lead + number + gap + title),
);

/** A time in the form `YYYY-MM-DDTHH:MM:SSZ`. */
export const arbRunTime: fc.Arbitrary<string> = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2099-12-31T23:59:59Z") })
  .filter((d) => !Number.isNaN(d.getTime()))
  .map((d) => d.toISOString().replace(/\.\d{3}Z$/, "Z"));

/** The number of earlier names in use with the same base (0 gives no suffix), and Hunk number `n`. */
export const arbCollisionCount: fc.Arbitrary<number> = fc.nat({ max: 4 });
export const arbHunkNumber: fc.Arbitrary<number> = fc.integer({ min: 0, max: 100000 });

/** Names of other windows; a leading control character means none equals a cleaned name. */
export const arbOtherTakenNames: fc.Arbitrary<string[]> = fc.array(
  arbTitleText.map((s) => `\u0001${s}`),
  { maxLength: 3 },
);
