import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

const REPO_ROOT = join(WEB_ROOT, "..", "..");

/** The mark's colours: page, ink, pane field, pane text, failing fill and its ring. */
const MARK_COLOURS = ["#0F2766", "#1B1915", "#A8001C", "#E8ECF6", "#FF8A8A", "#FFFDF8"];

describe("favicon: the mark _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_", () => {
  const path = join(WEB_ROOT, "app", "icon.svg");
  const readme = join(REPO_ROOT, "docs", "images", "mark.svg");

  it("exists and is the README mark, byte for byte", () => {
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(readFileSync(readme, "utf8"));
  });

  it("is a 32 by 32 drawing with no letters", () => {
    const svg = readFileSync(path, "utf8");
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("Georgia");
  });

  it("uses only the mark's six colours", () => {
    const svg = readFileSync(path, "utf8");
    const colours = new Set(
      [...svg.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase()),
    );
    expect([...colours].sort()).toEqual(MARK_COLOURS);
  });

  it("draws no script, link or embedded image", () => {
    const svg = readFileSync(path, "utf8");
    expect(svg).not.toMatch(/<script|<image|<a[\s>]|href=|xlink:/);
  });
});
