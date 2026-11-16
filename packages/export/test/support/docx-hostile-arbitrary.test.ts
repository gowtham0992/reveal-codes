import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbDocxHostileText } from "./arbitraries.js";

const CLASSES: Readonly<Record<string, (s: string) => boolean>> = {
  "U+000B": (s) => s.includes("\u000B"),
  "U+000C": (s) => s.includes("\u000C"),
  "other C0 control": (s) =>
    s.split("").some((c) => {
      const u = c.charCodeAt(0);
      return u <= 0x08 || (u >= 0x0e && u <= 0x1f);
    }),
  "U+FFFE": (s) => s.includes("\uFFFE"),
  "U+FFFF": (s) => s.includes("\uFFFF"),
  "unpaired high surrogate": (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(s),
  "unpaired low surrogate": (s) => /(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s),
  CRLF: (s) => s.includes("\r\n"),
  "lone CR": (s) => /\r(?!\n)/.test(s),
  "astral character": (s) => /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s),
  "ordinary character": (s) => /[a-zA-Z0-9]/.test(s),
};

describe("arbDocxHostileText self-test _Requirements: 22.6, 22.7_", () => {
  const sample = fc.sample(arbDocxHostileText, { numRuns: 1000, seed: 42 });

  for (const [name, test] of Object.entries(CLASSES)) {
    it(`reaches ${name}`, () => {
      expect(sample.some(test)).toBe(true);
    });
  }

  it("also produces the empty string and strings of more than ten code units", () => {
    expect(sample.some((s) => s === "")).toBe(true);
    expect(sample.some((s) => s.length > 10)).toBe(true);
  });
});
