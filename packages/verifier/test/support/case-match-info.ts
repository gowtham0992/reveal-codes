import * as fc from "fast-check";
import { POOL_A_M, POOL_N_Z, arbPooledCaseName } from "../../../engine/src/testing/arb-case-match";
import type { CitationRecord } from "@reveal-codes/engine";
import { lineText, member } from "./case-match-scenario";

// ---- Property 12 harness: one record on one line, with generated `date_filed` and `absolute_url`. ----

export const arbDigits4 = fc.stringMatching(/^[0-9]{4}$/);
/** `date_filed` values: digit heads (below, at and above 1000), digit-light heads and arbitrary text. */
export const arbDateFiled: fc.Arbitrary<string> = fc.oneof(
  fc.tuple(arbDigits4, fc.constantFrom("", "-05-18", "x", "5")).map(([y, t]) => y + t),
  fc
    .tuple(fc.integer({ min: 0, max: 999 }), fc.constant("-01-01"))
    .map(([y, t]) => String(y).padStart(4, "0") + t),
  fc.stringMatching(/^[0-9]{0,3}[^0-9][0-9a-z-]{0,8}$/),
  fc.string({ maxLength: 12 }),
);
/** `absolute_url` values of every JSON shape; only a string with a single leading `/` is usable. */
export const arbAbsoluteUrl: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(
    undefined,
    null,
    7,
    true,
    "",
    "/",
    "//",
    "//evil.example/x",
    "http://x/y",
    "opinion/1/x/",
  ),
  fc.string({ maxLength: 12 }).map((s) => `/${s}`),
  fc.string({ maxLength: 12 }).map((s) => `//${s}`),
  fc.string({ maxLength: 12 }),
);

export type InfoCase = Readonly<{
  cited: string | undefined;
  found: string;
  dateFiled: string;
  absoluteUrl: unknown;
}>;

export const arbInfoCase: fc.Arbitrary<InfoCase> = fc.record({
  cited: fc.oneof(fc.constant(undefined), arbPooledCaseName(POOL_A_M), arbPooledCaseName(POOL_N_Z)),
  found: arbPooledCaseName(POOL_A_M),
  dateFiled: arbDateFiled,
  absoluteUrl: arbAbsoluteUrl,
});

export function infoRecord(cited: string | undefined): CitationRecord {
  const text = lineText(0);
  const caseName = cited === undefined ? {} : { caseName: cited };
  return {
    kind: "full",
    key: "k0",
    citation: {
      start: 0,
      end: text.length,
      text,
      value: { kind: "reporter", ...member(0) },
      ...caseName,
    },
    result: { status: "unchecked" },
  };
}

export const expectedYear = (d: string): number | undefined => {
  const head = d.slice(0, 4);
  return /^[0-9]{4}$/.test(head) && Number(head) >= 1000 ? Number(head) : undefined;
};
export const expectedUrl = (u: unknown): string | undefined =>
  typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u : undefined;
