import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "../support/css";
import { WEB_ROOT } from "../support/scan";

const PATH = "src/components/toolbar.module.css";
const css = parseCss(readFileSync(join(WEB_ROOT, PATH), "utf8"));
const notice = (prop: string): string | undefined =>
  css.declarations.find((d) => d.selector.trim() === ".notice" && d.prop === prop)?.value;

describe("Toolbar notice stylesheet _Requirements: 32.1, 32.2, 32.3, 32.4, 32.11_", () => {
  it("clamps .notice to two lines and hides the overflow", () => {
    expect(notice("display")).toBe("-webkit-box");
    expect(notice("-webkit-box-orient")).toBe("vertical");
    expect(notice("-webkit-line-clamp")).toBe("2");
    expect(notice("line-clamp")).toBe("2");
    expect(notice("overflow")).toBe("hidden");
  });

  it("holds no width at-rule", () => {
    const widths = css.atRules.filter((r) => /\b(?:min|max)-width\b/.test(r.prelude));
    expect(widths).toEqual([]);
  });

  it("holds no animation and no transition", () => {
    const motion = css.declarations.filter((d) => /^(?:animation|transition)(?:-|$)/.test(d.prop));
    expect(motion).toEqual([]);
    expect(css.atRules.filter((r) => /keyframes/.test(r.name))).toEqual([]);
  });

  it("holds no colour literal", () => {
    const literal = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;
    const hits = css.declarations.filter((d) => literal.test(d.value));
    expect(hits).toEqual([]);
  });
});
