import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(path.join(dir, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(dir, e.name)]
        : [],
  );
}

describe("stdout stays clean _Requirements: 13.13_", () => {
  it("src has no console.log, console.info, console.debug or process.stdout", () => {
    const banned = /console\.(log|info|debug)\b|process\.stdout/;
    const hits = files(SRC).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          banned.test(line) ? [`${path.relative(SRC, f)}:${String(i + 1)}`] : [],
        ),
    );
    expect(hits).toEqual([]);
  });
});
