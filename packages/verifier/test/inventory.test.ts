import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MARKER = /^\/\/ Property (\d+)\s*$/gm;
const ASSERT = /fc\.assert\(\s*fc\.(?:async)?[Pp]roperty\(/g;
const DESCRIBE = /^describe\((["'`])([^\n]*?)\1,/gm;

type Found = Readonly<{ file: string; n: number; block: string }>;

function propertyFiles(): readonly string[] {
  return readdirSync(DIR).filter((f) => f.endsWith(".properties.test.ts"));
}

function blocksOf(file: string): readonly Found[] {
  const text = readFileSync(path.join(DIR, file), "utf8");
  const marks = [...text.matchAll(MARKER)];
  return marks.map((m, i) => ({
    file,
    n: Number(m[1]),
    block: text.slice(m.index, marks[i + 1]?.index ?? text.length),
  }));
}

function all(): readonly Found[] {
  return propertyFiles().flatMap(blocksOf);
}

describe("property inventory _Requirements: 15.1, 15.2_", () => {
  it("has exactly the properties 1 to 12, once each", () => {
    const numbers = all()
      .map((f) => f.n)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("each marker is followed by exactly one fc.assert(fc.property(", () => {
    for (const f of all()) {
      expect(f.block.match(ASSERT)?.length, `${f.file} Property ${String(f.n)}`).toBe(1);
    }
  });

  it("each marker is followed by a describe whose title ends in _Requirements: x.y_", () => {
    for (const f of all()) {
      const titles = [...f.block.matchAll(DESCRIBE)].map((m) => m[2] ?? "");
      const first = titles[0] ?? "";
      expect(first, `${f.file} Property ${String(f.n)}`).toMatch(
        /_Requirements: \d+\.\d+(?:, \d+\.\d+)*_$/,
      );
    }
  });
});
