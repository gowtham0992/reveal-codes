import { describe, expect, it } from "vitest";
import { isInstant, localDate, localDateTime } from "../src/time.js";

describe("isInstant", () => {
  it("accepts ISO 8601 UTC instants", () => {
    expect(isInstant("2026-03-05T02:30:00Z")).toBe(true);
    expect(isInstant("2026-03-05T02:30:00.000Z")).toBe(true);
  });

  it("rejects garbage, offsets, and impossible dates", () => {
    expect(isInstant("")).toBe(false);
    expect(isInstant("yesterday")).toBe(false);
    expect(isInstant("2026-03-05")).toBe(false);
    expect(isInstant("2026-03-05T02:30:00+02:00")).toBe(false);
    expect(isInstant("2026-13-05T02:30:00Z")).toBe(false);
  });
});

describe("localDateTime", () => {
  it("zero-pads month, day, hour and minute", () => {
    expect(localDateTime(new Date(2026, 0, 5, 3, 7))).toBe("2026-01-05 03:07");
  });

  it("prints midnight and 23:59 in 24-hour form", () => {
    expect(localDateTime(new Date(2026, 5, 9, 0, 0))).toBe("2026-06-09 00:00");
    expect(localDateTime(new Date(2026, 5, 9, 23, 59))).toBe("2026-06-09 23:59");
  });

  it("reads the host zone, not UTC (pinned America/Los_Angeles)", () => {
    expect(localDateTime(new Date("2026-03-05T02:30:00Z"))).toBe("2026-03-04 18:30");
  });
});

describe("localDate", () => {
  it("zero-pads month and day", () => {
    expect(localDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("crosses a year boundary using local components", () => {
    expect(localDate(new Date(2025, 11, 31, 23, 59, 59))).toBe("2025-12-31");
    expect(localDate(new Date(2026, 0, 1, 0, 0, 0))).toBe("2026-01-01");
  });

  it("reads the host zone, not UTC (pinned America/Los_Angeles)", () => {
    expect(localDate(new Date("2026-03-05T02:30:00Z"))).toBe("2026-03-04");
  });
});
