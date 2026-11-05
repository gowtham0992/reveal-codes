/**
 * Malformed Timestamps (Req 2.7, 7.6; design A2, Property 10). Built only
 * from fast-check combinators over `arbTimestamp`, so every value shrinks,
 * and filtered through `!isTimestamp`, so every value is genuinely invalid.
 */
import fc from "fast-check";
import { isTimestamp } from "../validate.js";
import { arbTimestamp } from "./arb-text.js";

/** Start offsets of the two-digit month, day, hour, minute, and second fields. */
const FIELD_STARTS = [5, 8, 11, 14, 17] as const;

/** A valid Timestamp with one two-digit field replaced by `00`–`99` (month 13, hour 24, Feb 29, …). */
const arbBadField: fc.Arbitrary<string> = fc
  .tuple(arbTimestamp, fc.constantFrom(...FIELD_STARTS), fc.integer({ min: 0, max: 99 }))
  .map(([t, at, n]) => `${t.slice(0, at)}${String(n).padStart(2, "0")}${t.slice(at + 2)}`);

/** A valid Timestamp with its `Z` replaced by a numeric offset (including `+00:00`). */
const arbOffsetZone: fc.Arbitrary<string> = fc
  .tuple(arbTimestamp, fc.constantFrom("+01:00", "-05:00", "+00:00", "+0100"))
  .map(([t, zone]) => `${t.slice(0, -1)}${zone}`);

/** Syntactic variants of a valid Timestamp: date only, no `Z`, lowercase, space separator. */
const arbVariant: fc.Arbitrary<string> = fc
  .tuple(arbTimestamp, fc.constantFrom("date", "noZ", "lower", "space", "frac10"))
  .map(([t, how]) => {
    if (how === "date") return t.slice(0, 10);
    if (how === "noZ") return t.slice(0, -1);
    if (how === "lower") return t.toLowerCase();
    if (how === "space") return t.replace("T", " ");
    return `${t.slice(0, 19)}.1234567890Z`;
  });

/** Strings that fail `isTimestamp`: malformed fields, zones, variants, empty, and garbage. */
export const arbBadTimestamp: fc.Arbitrary<string> = fc
  .oneof(arbBadField, arbOffsetZone, arbVariant, fc.constant(""), fc.string())
  .filter((v) => !isTimestamp(v));
