import { describe, expect, it } from "vitest";
import { parseRetryAfter, parseWaitUntil, retryAfterIso, toIso } from "../src/time";

const NOW = Date.parse("2026-11-02T12:00:00.000Z");

describe("toIso", () => {
  it("formats a normal instant", () => {
    expect(toIso(NOW)).toBe("2026-11-02T12:00:00.000Z");
  });
  it("rejects years outside 0000 to 9999 and non-finite values", () => {
    expect(toIso(253_402_300_800_000)).toBeNull();
    expect(toIso(-62_167_219_200_001)).toBeNull();
    expect(toIso(Number.NaN)).toBeNull();
    expect(toIso(Number.POSITIVE_INFINITY)).toBeNull();
  });
  it("accepts both edges of the range", () => {
    expect(toIso(253_402_300_799_999)).toBe("9999-12-31T23:59:59.999Z");
    expect(toIso(-62_167_219_200_000)).toBe("0000-01-01T00:00:00.000Z");
  });
});

describe("parseRetryAfter", () => {
  it("reads integer seconds", () => {
    expect(parseRetryAfter("30", NOW)).toBe(30_000);
    expect(parseRetryAfter("0", NOW)).toBe(0);
  });
  it("reads an HTTP date as a delay from now, never negative", () => {
    expect(parseRetryAfter("Mon, 02 Nov 2026 12:01:00 GMT", NOW)).toBe(60_000);
    expect(parseRetryAfter("Mon, 02 Nov 2026 11:00:00 GMT", NOW)).toBe(0);
  });
  it("returns null for garbage, negatives, fractions and absence", () => {
    for (const v of ["soon", "-5", "1.5", "", "  ", "12abc"])
      expect(parseRetryAfter(v, NOW)).toBeNull();
    expect(parseRetryAfter(null, NOW)).toBeNull();
  });
  it("converts to an ISO timestamp with the injected clock", () => {
    expect(retryAfterIso("30", NOW)).toBe("2026-11-02T12:00:30.000Z");
    expect(retryAfterIso("nope", NOW)).toBeNull();
  });
});

describe("parseWaitUntil", () => {
  it("normalises several ISO forms to UTC", () => {
    expect(parseWaitUntil("2026-11-02T12:00:30Z")).toBe("2026-11-02T12:00:30.000Z");
    expect(parseWaitUntil("2026-11-02T12:00:30.5+00:00")).toBe("2026-11-02T12:00:30.500Z");
    expect(parseWaitUntil("2026-11-02T14:00:30+02:00")).toBe("2026-11-02T12:00:30.000Z");
  });
  it("returns null for non-strings, empty and unparseable values", () => {
    for (const v of [undefined, null, 5, {}, "", "  ", "later"])
      expect(parseWaitUntil(v)).toBeNull();
  });
});
