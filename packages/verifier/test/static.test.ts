import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatHit, listTsFiles, readText, scanSource } from "./support/scan-source";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

describe("static source guards _Requirements: 11.3_", () => {
  it("src/ has no ambient environment, clock, timer or global fetch use", () => {
    const hits = listTsFiles(SRC).flatMap((f) =>
      scanSource(path.relative(SRC, f), readText(f)).map(formatHit),
    );
    expect(hits).toEqual([]);
  });

  it("reports a planted violation with its path and line", () => {
    const planted = [
      "export const a = 1;",
      "// Date.now( in a comment is ignored",
      'export const s = "process.env in a string is ignored";',
      "export const t = Date.now();",
      "export const r = await fetch(url);",
    ].join("\n");
    const hits = scanSource("src/planted.ts", planted).map(formatHit);
    expect(hits).toEqual(["src/planted.ts:4 Date.now(", "src/planted.ts:5 fetch("]);
  });

  it("lets deps.fetch, regex literals and template text through", () => {
    const ok = [
      "const a = await deps.fetch(url, init);",
      "const re = /fetch\\(|setTimeout\\(/g;",
      "const msg = `uses new Date() and ${deps.fetch(u)}`;",
    ].join("\n");
    expect(scanSource("src/ok.ts", ok)).toEqual([]);
  });

  it("flags new Date() with no argument but not new Date(ms)", () => {
    const hits = scanSource("f.ts", "const a = new Date();\nconst b = new Date(5);");
    expect(hits.map(formatHit)).toEqual(["f.ts:1 new Date()"]);
  });

  it("scans an existing src directory", () => {
    expect(existsSync(SRC)).toBe(true);
    expect(listTsFiles(SRC).length).toBeGreaterThan(0);
  });
});
