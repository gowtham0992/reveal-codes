import { describe, expect, it } from "vitest";
import { UNRESOLVABLE_FORMS } from "../src/unresolvable";

describe("UNRESOLVABLE_FORMS", () => {
  it("has exactly one entry each for WL and LEXIS", () => {
    expect(UNRESOLVABLE_FORMS.map((f) => f.form).sort()).toEqual(["LEXIS", "WL"]);
  });
  it("describes each form in at most 200 characters and says CourtListener does not resolve it", () => {
    for (const f of UNRESOLVABLE_FORMS) {
      expect(f.description.length).toBeGreaterThan(0);
      expect(f.description.length).toBeLessThanOrEqual(200);
      expect(f.description).toContain(f.form);
      expect(f.description).toContain("CourtListener does not resolve");
    }
  });
});
