import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

const decls = (path: string, selector: string): Record<string, string> => {
  const css = parseCss(readFileSync(join(WEB_ROOT, path), "utf8"));
  return Object.fromEntries(
    css.declarations.filter((d) => d.selector === selector).map((d) => [d.prop, d.value]),
  );
};

describe("Export dialog code chips match the Issues list chips", () => {
  const list = "src/components/issues-list.module.css";
  const dialog = "src/components/export-dialog.module.css";
  it("outline chip: every declaration of the Issues list chip, plus inline-block", () => {
    expect(decls(dialog, ".codeChip")).toEqual({
      ...decls(list, ".chip"),
      display: "inline-block",
    });
  });
  it("fail chip: every declaration of the Issues list failing chip, plus inline-block", () => {
    expect(decls(dialog, ".codeChipFail")).toEqual({
      ...decls(list, ".chipFail"),
      display: "inline-block",
    });
    expect(decls(dialog, ".codeChipFail")["background"]).toBe("var(--fail)");
    expect(decls(dialog, ".codeChipFail")["color"]).toBe("var(--white)");
  });
});
