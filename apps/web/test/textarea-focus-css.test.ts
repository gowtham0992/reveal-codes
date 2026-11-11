import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

describe("a focused text area shows one ring", () => {
  const css = parseCss(readFileSync(join(WEB_ROOT, "app/globals.css"), "utf8"));
  const focused = (prop: string): string[] =>
    css.declarations
      .filter((d) => d.selector === "textarea:focus" && d.prop === prop)
      .map((d) => d.value.trim());
  it("keeps the 2px oxblood border and draws no outline", () => {
    expect(focused("border")).toEqual(["2px solid var(--oxblood)"]);
    expect(focused("outline")).toEqual(["none"]);
  });
  it("wins over the global focus outline", () => {
    // `textarea:focus` (one element, one pseudo-class) outranks `:focus-visible` (one pseudo-class).
    const global = css.declarations.filter(
      (d) => d.selector.trim() === ":focus-visible" && d.prop === "outline",
    );
    expect(global.map((d) => d.value.trim())).toEqual(["2px solid var(--oxblood)"]);
  });
  it("leaves no textarea rule in a component sheet that sets an outline", () => {
    const sheets = ["override-dialog", "assistant-panel"].map((name) =>
      parseCss(readFileSync(join(WEB_ROOT, `src/components/${name}.module.css`), "utf8")),
    );
    for (const sheet of sheets) {
      expect(sheet.declarations.filter((d) => d.prop === "outline")).toEqual([]);
    }
  });
});
