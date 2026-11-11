import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCss } from "./support/css";
import { WEB_ROOT } from "./support/scan";

describe("the mark's box", () => {
  const css = parseCss(readFileSync(join(WEB_ROOT, "src/components/mark.module.css"), "utf8"));
  const value = (prop: string): string | undefined =>
    css.declarations.find((d) => d.selector === ".mark" && d.prop === prop)?.value.trim();
  it("is 24px square with 10px before the wordmark, and never shrinks", () => {
    expect(value("width")).toBe("24px");
    expect(value("height")).toBe("24px");
    expect(value("margin-right")).toBe("10px");
    expect(value("flex")).toBe("none");
  });
  it("leaves the wordmark boxes as they were", () => {
    const toolbar = parseCss(
      readFileSync(join(WEB_ROOT, "src/components/toolbar.module.css"), "utf8"),
    );
    const get = (prop: string): string | undefined =>
      toolbar.declarations.find((d) => d.selector === ".wordmark" && d.prop === prop)?.value.trim();
    expect(get("margin-right")).toBe("24px");
    expect(get("padding-right")).toBe("24px");
    expect(get("align-self")).toBe("stretch");
    expect(get("display")).toBe("flex");
  });
});
