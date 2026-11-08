import { describe, expect, it } from "vitest";
import { exportFileName } from "../src/file-name.js";

const NOON = new Date(2026, 5, 15, 12, 0, 0);

describe("exportFileName slug", () => {
  it("lowercases and collapses spaces and punctuation", () => {
    expect(exportFileName("Motion  to Dismiss, (Rule 12(b)(6))!", NOON)).toBe(
      "motion-to-dismiss-rule-12-b-6-2026-06-15.docx",
    );
  });

  it("strips leading and trailing dashes", () => {
    expect(exportFileName("--- Hello ---", NOON)).toBe("hello-2026-06-15.docx");
  });

  it("cuts to 60 characters and strips a trailing dash after the cut", () => {
    const caption = `${"a".repeat(59)} bbbb`;
    expect(exportFileName(caption, NOON)).toBe(`${"a".repeat(59)}-2026-06-15.docx`);
    expect(exportFileName("c".repeat(80), NOON)).toBe(`${"c".repeat(60)}-2026-06-15.docx`);
  });

  it("uses filing for an empty caption or one with no a-z0-9", () => {
    expect(exportFileName("", NOON)).toBe("filing-2026-06-15.docx");
    expect(exportFileName("  !!  ", NOON)).toBe("filing-2026-06-15.docx");
  });

  it("drops non-ASCII characters", () => {
    expect(exportFileName("Café Müller v. Ñandú", NOON)).toBe("caf-m-ller-v-and-2026-06-15.docx");
    expect(exportFileName("日本語", NOON)).toBe("filing-2026-06-15.docx");
  });
});

describe("exportFileName local date (pinned America/Los_Angeles)", () => {
  it("uses the local date for the instant 2026-03-05T02:30:00Z", () => {
    const name = exportFileName("Motion", new Date("2026-03-05T02:30:00Z"));
    expect(name.endsWith("-2026-03-04.docx")).toBe(true);
  });

  it("keeps the same day at local 23:59:59", () => {
    expect(exportFileName("m", new Date(2026, 2, 4, 23, 59, 59))).toBe("m-2026-03-04.docx");
  });

  it("rolls to the next day at local 00:00:00", () => {
    expect(exportFileName("m", new Date(2026, 2, 5, 0, 0, 0))).toBe("m-2026-03-05.docx");
  });
});
