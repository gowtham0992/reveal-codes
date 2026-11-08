import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

describe("window title metadata _Requirements: 10.1, 10.3_", () => {
  it("keeps title out of the root layout metadata so it cannot overwrite the rendered title", () => {
    const layout = readFileSync(join(WEB_ROOT, "app", "layout.tsx"), "utf8");
    expect(layout).not.toMatch(/\btitle\s*:/);
  });

  it("gives the print page its own title", () => {
    const page = readFileSync(join(WEB_ROOT, "app", "print", "page.tsx"), "utf8");
    expect(page).toContain('title: "Print \\u2014 Reveal Codes"');
  });
});
