import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "./support/scan";

/** _Requirements: 10.1, 10.2_ */
const ui = readFileSync(join(WEB_ROOT, "../../.kiro/steering/ui.md"), "utf8");

const TOKENS: readonly (readonly [string, string])[] = [
  ["--paper", "#FFFDF8"],
  ["--desk", "#E9E3D6"],
  ["--panel", "#FBF8F1"],
  ["--ink", "#1B1915"],
  ["--muted", "#5E574C"],
  ["--rule", "#CFC6B4"],
  ["--oxblood", "#6B1A24"],
  ["--fail", "#A8001C"],
  ["--fail-ring", "#FF8A8A"],
  ["--rule-light", "#DDD4C2"],
  ["--margin-rule", "#B5A98F"],
  ["--disabled-border", "#8C8475"],
  ["--disabled-fill", "#F1ECE1"],
  ["--white", "#FFFFFF"],
  ["--overlay", "rgba(27, 25, 21, 0.55)"],
  ["--print-paper", "#FFFFFF"],
  ["--print-ink", "#111111"],
  ["--print-rule", "#B0B0B0"],
];

describe("ui.md  _Requirements: 10.1, 10.2_", () => {
  it.each(TOKENS)("lists %s with value %s in one table row", (name, value) => {
    const lines = ui.split("\n").filter((l) => l.includes(`\`${name}\``));
    expect(lines.some((l) => l.includes(`\`${value}\``))).toBe(true);
  });

  it.each(["Public Sans", "Libre Caslon Text", "IBM Plex Mono"])(
    "names the family %s",
    (family) => {
      expect(ui).toContain(family);
    },
  );

  it("holds none of the old palette", () => {
    expect(ui.toLowerCase()).not.toContain("#1f3a8a");
    expect(ui.toLowerCase()).not.toContain("#ececec");
  });

  it.each([
    "No component library, no icon library",
    "Text labels only.",
    "No animation and no transition.",
    "No shadows, no gradients, no rounded corners.",
    "Severity is never shown by colour alone.",
    "The text of the Document is never styled.",
  ])("keeps the rule line: %s", (line) => {
    expect(ui).toContain(line);
  });

  it.each([
    "52px",
    "26px",
    "32px",
    "260px",
    "300px",
    "816px",
    "1150px",
    "800px",
    "96px 96px 96px 104px",
    "40%",
  ])("states the layout size %s", (size) => {
    expect(ui).toContain(size);
  });

  it("keeps its front matter", () => {
    expect(ui.startsWith("---\ninclusion: fileMatch\nfileMatchPattern: [")).toBe(true);
    expect(ui).toContain('"apps/web/**", "**/*.css", ".kiro/specs/**/design.md"');
  });
});
