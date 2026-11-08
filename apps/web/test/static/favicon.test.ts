import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

describe("favicon _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_", () => {
  const path = join(WEB_ROOT, "app", "icon.svg");

  it("exists and shows only the letters RC in Georgia bold", () => {
    expect(existsSync(path)).toBe(true);
    const svg = readFileSync(path, "utf8");
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(texts).toEqual(["RC"]);
    expect(svg).toContain("Georgia");
    expect(svg).toContain('font-weight="700"');
  });

  it("uses only the paper and ink colours", () => {
    const svg = readFileSync(path, "utf8");
    const colours = new Set(
      [...svg.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase()),
    );
    expect([...colours].sort()).toEqual(["#111111", "#FFFFFF"]);
  });
});
