import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatViolations, WEB_ROOT } from "../support/scan";
import {
  colourViolations,
  parseTokenSheet,
  PRINT_COLOUR_VALUES,
  TOKEN_VALUES,
} from "./css-colours";

/** Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 10.3 */
const globalsText = readFileSync(join(WEB_ROOT, "app", "globals.css"), "utf8");
const MODULE = "src/components/x.module.css";

const scan = (text: string, path = MODULE): string[] =>
  formatViolations(colourViolations([{ path, text }]));

describe("static: Token_Sheet _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_", () => {
  const tokens = parseTokenSheet(globalsText);

  it("declares the fifteen colour Tokens with the listed values and no others", () => {
    expect(Object.keys(TOKEN_VALUES)).toHaveLength(15);
    for (const [name, value] of Object.entries(TOKEN_VALUES)) {
      expect(tokens[name]?.toLowerCase(), name).toBe(value.toLowerCase());
    }
  });

  it("declares the print colours and no colour name outside the lists", () => {
    for (const [name, value] of Object.entries(PRINT_COLOUR_VALUES)) {
      expect(tokens[name]?.toLowerCase(), name).toBe(value);
    }
    const colourNames = Object.entries(tokens)
      .filter(([, v]) => /^(?:#[0-9a-f]{3,8}|rgba?\()/i.test(v))
      .map(([n]) => n)
      .sort();
    expect(colourNames).toEqual(
      [...Object.keys(TOKEN_VALUES), ...Object.keys(PRINT_COLOUR_VALUES)].sort(),
    );
  });

  it("declares exactly the Token_Sheet names and no temporary alias", () => {
    const expected = [
      ...Object.keys(TOKEN_VALUES),
      ...Object.keys(PRINT_COLOUR_VALUES),
      "--print-font-text",
      "--print-font-mono",
      "--font-ui",
      "--font-editor",
      "--font-pane",
      "--page-max",
      "--toolbar-h",
      "--status-h",
      "--strip-w",
      "--left-w",
      "--right-w",
      "--pane-h",
      "--shell-min",
      "--control-h",
    ].sort();
    expect(Object.keys(tokens).sort()).toEqual(expected);
    expect(globalsText).not.toContain("TEMPORARY");
  });

  it("keeps every stylesheet outside the Pane on Tokens", () => {
    expect(scan(globalsText, "app/globals.css")).toEqual([]);
  });
});

describe("static: colour scan self-test (planted violations) _Requirements: 1.5, 1.6, 10.3_", () => {
  it("reports a stray hex literal in a module", () => {
    expect(scan(".a {\n  color: #123456;\n}\n")).toEqual([
      `${MODULE}:2 colour #123456 is allowed only on its Token in :root`,
    ]);
  });

  it("reports a stray rgba and a colour function", () => {
    expect(scan(".a {\n  background: rgba(0, 0, 0, 0.5);\n}\n")).toEqual([
      `${MODULE}:2 colour rgba(0, 0, 0, 0.5) is allowed only on its Token in :root`,
    ]);
    expect(scan(".a {\n  color: color-mix(in srgb, red, blue);\n}\n")).not.toEqual([]);
  });

  it("reports a named colour", () => {
    expect(scan(".a {\n  background: red;\n}\n")).toEqual([
      `${MODULE}:2 named colour red is not a Token`,
    ]);
  });

  it("reports a hex literal that is a Token value when it sits outside :root", () => {
    expect(scan(".a {\n  color: #1b1915;\n}\n")).toEqual([
      `${MODULE}:2 colour #1b1915 is allowed only on its Token in :root`,
    ]);
  });

  it("reports a Token declared with the wrong value", () => {
    expect(scan(":root {\n  --ink: #111111;\n}\n", "app/globals.css")).toEqual([
      "app/globals.css:2 --ink must be #1b1915",
    ]);
  });

  it("reports a colour literal on a custom property that is not a Token", () => {
    expect(scan(":root {\n  --brand: #1b1915;\n}\n", "app/globals.css")).toEqual([
      "app/globals.css:2 colour #1b1915 is allowed only on its Token in :root",
    ]);
  });

  it("reports an unknown var(--x) in a colour property", () => {
    expect(scan(".a {\n  border: 1px solid var(--brand);\n}\n")).toEqual([
      `${MODULE}:2 --brand is not a Token`,
    ]);
  });

  it("accepts Tokens and var() outside colour properties, and reports a removed alias", () => {
    expect(scan(".a {\n  color: var(--ink);\n  border: 1px solid var(--rule-light);\n}\n")).toEqual(
      [],
    );
    expect(scan(".a {\n  background: var(--ui-bg);\n}\n")).toEqual([
      `${MODULE}:2 --ui-bg is not a Token`,
    ]);
    expect(scan(".a {\n  height: var(--control-h);\n}\n")).toEqual([]);
  });

  it("leaves Pane files to the Pane checks", () => {
    expect(scan(".a {\n  color: #55ff55;\n}\n", "src/pane/pane.module.css")).toEqual([]);
  });
});
