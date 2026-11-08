import { describe, expect, it } from "vitest";

describe("export project time zone _Requirements: 10.2_", () => {
  it("runs pinned to America/Los_Angeles (UTC-8 in January)", () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480);
  });
});
