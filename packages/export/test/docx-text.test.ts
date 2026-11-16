import { describe, expect, it } from "vitest";
import { docxSafe, holdsDocxUnsafe } from "../src/index.js";

// _Requirements: 22.1, 22.2, 22.5_

function agrees(s: string): boolean {
  const converted = s.includes("\u000b") || s.includes("\u000c");
  return holdsDocxUnsafe(s) === (docxSafe(s).removed > 0 || converted);
}

/** Every code unit U+0000 to U+FFFF, passed through `strings`; returns the units whose strings fail `ok`. */
function failingUnits(strings: (c: string) => string[], ok: (s: string) => boolean): string[] {
  const failures: string[] = [];
  for (let u = 0; u <= 0xffff; u++) {
    for (const s of strings(String.fromCharCode(u))) {
      if (!ok(s)) failures.push(`U+${u.toString(16)} ${JSON.stringify(s)}`);
    }
  }
  return failures;
}

const ASTRAL = ["\u{10000}", "\u{1F600}", "\u{1F4A9}", "\u{10FFFF}", "\u{20000}", "\u{E0001}"];

describe("holdsDocxUnsafe over docxSafe output", () => {
  it("is false for every UTF-16 code unit alone", () => {
    expect(
      failingUnits(
        (c) => [c],
        (s) => !holdsDocxUnsafe(docxSafe(s).text),
      ),
    ).toEqual([]);
  });

  it("is false for every UTF-16 code unit between two ASCII letters", () => {
    expect(
      failingUnits(
        (c) => [`a${c}b`],
        (s) => !holdsDocxUnsafe(docxSafe(s).text),
      ),
    ).toEqual([]);
  });

  it("is false for every code unit next to a surrogate and a CR", () => {
    const around = (c: string): string[] => [`\ud83d${c}`, `${c}\ude00`, `\r${c}`, `${c}\r`];
    expect(failingUnits(around, (s) => !holdsDocxUnsafe(docxSafe(s).text))).toEqual([]);
  });

  it("is false for astral characters, surrogate pairs and unpaired surrogates", () => {
    const cases = [
      ...ASTRAL,
      ...ASTRAL.map((a) => `x${a}y`),
      "\ud83d",
      "\ude00",
      "\ud83d\ud83d",
      "\ude00\ude00",
      "\ude00\ud83d",
      "\ud83d\ude00",
      "a\ud83db",
      "a\ude00b",
      "\ud83d\ud83d\ude00",
      "\ud83d\ude00\ude00",
    ];
    for (const s of cases) expect(holdsDocxUnsafe(docxSafe(s).text), JSON.stringify(s)).toBe(false);
  });

  it("is false for \\r, \\r\\n, \\n\\r, U+000B and U+000C combinations", () => {
    const cases = [
      "\r",
      "\r\n",
      "\n\r",
      "\r\r\n",
      "\u000b",
      "\u000c",
      "\r\u000b",
      "\u000b\r",
      "\u000b\u000c",
      "a\r\n\u000b\u000cb\u0000",
    ];
    for (const s of cases) expect(holdsDocxUnsafe(docxSafe(s).text), JSON.stringify(s)).toBe(false);
  });
});

describe("holdsDocxUnsafe agrees with docxSafe on the table", () => {
  it("holds for every code unit alone and between letters", () => {
    expect(failingUnits((c) => [c, `a${c}b`], agrees)).toEqual([]);
  });

  it("holds for sampled astral, surrogate and control cases", () => {
    for (const s of [
      ...ASTRAL,
      "\ud83d",
      "\ude00",
      "\ud83d\ude00",
      "\ude00\ud83d",
      "\r",
      "\r\n",
      "\u000b",
      "\u000c",
    ]) {
      expect(agrees(s), JSON.stringify(s)).toBe(true);
    }
  });

  it("flags U+000B and U+000C although docxSafe converts them", () => {
    expect(holdsDocxUnsafe("\u000b")).toBe(true);
    expect(holdsDocxUnsafe("\u000c")).toBe(true);
    expect(docxSafe("\u000b").removed).toBe(0);
    expect(docxSafe("\u000c").removed).toBe(0);
  });
});

describe("docxSafe examples", () => {
  it("converts U+000B and U+000C to newlines without counting them", () => {
    expect(docxSafe("a\u000bb\u000cc")).toEqual({ text: "a\nb\nc", removed: 0 });
  });

  it("converts \\r\\n and a lone \\r to one newline each", () => {
    expect(docxSafe("a\r\nb\rc")).toEqual({ text: "a\nb\nc", removed: 0 });
  });

  it("gives two newlines for \\r\\v", () => {
    expect(docxSafe("a\r\u000bb")).toEqual({ text: "a\n\nb", removed: 0 });
  });

  it("gives two newlines for \\r\\r\\n", () => {
    expect(docxSafe("\r\r\n")).toEqual({ text: "\n\n", removed: 0 });
  });

  it("removes and counts each control character, U+FFFE and U+FFFF", () => {
    expect(docxSafe("a\u0000b\u0001c\ufffed\uffffe")).toEqual({ text: "abcde", removed: 4 });
  });

  it("counts a lone surrogate once and keeps a valid pair", () => {
    expect(docxSafe("a\ud83db")).toEqual({ text: "ab", removed: 1 });
    expect(docxSafe("a\ude00b")).toEqual({ text: "ab", removed: 1 });
    expect(docxSafe("\ud83d\ud83d\ude00")).toEqual({ text: "\ud83d\ude00", removed: 1 });
    expect(docxSafe("a\u{1F600}b")).toEqual({ text: "a\u{1F600}b", removed: 0 });
  });

  it("keeps tab, newline and edge allowed characters", () => {
    const s = "\t\n \ud7ff\ue000\ufffd\u{10000}\u{10FFFF}";
    expect(docxSafe(s)).toEqual({ text: s, removed: 0 });
  });

  it("returns its input unchanged when nothing is unsafe and there is no \\r", () => {
    const s = "Roe v. Wade, 410 U.S. 113 (1973)\n\u{1F600}";
    expect(docxSafe(s)).toEqual({ text: s, removed: 0 });
  });

  it("is idempotent, with removed 0 on the second pass", () => {
    for (const s of ["a\u0000b\r\n\u000bc\ud83d", "\r\u000b", "\ufffe\uffff", "x\ude00\ud83dy"]) {
      const once = docxSafe(s);
      expect(docxSafe(once.text)).toEqual({ text: once.text, removed: 0 });
    }
  });
});
