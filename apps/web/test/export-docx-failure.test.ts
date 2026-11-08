import { describe, expect, it, vi } from "vitest";

// Only the export package's builders are replaced, to reach failure branches that a
// valid Document cannot. The Engine is real.
const hooks = vi.hoisted(() => ({
  docx: "real",
  appendix: "real",
}));

vi.mock("@reveal-codes/export", async (importOriginal) => {
  const real = await importOriginal<typeof import("@reveal-codes/export")>();
  return {
    ...real,
    buildDocx: (...args: Parameters<typeof real.buildDocx>) =>
      hooks.docx === "reject" ? Promise.reject(new Error("pack failed")) : real.buildDocx(...args),
    buildAppendix: (...args: Parameters<typeof real.buildAppendix>) => {
      const a = real.buildAppendix(...args);
      return hooks.appendix === "bad" ? { ...a, lines: ["[CIT ✓]unterminated"] } : a;
    },
  };
});

import { exportDocx } from "../src/client/export-docx";
import { EXPORT_FAILED } from "../src/notices";
import { EXPORT_NOW, gateClearDocument, storeWith } from "./support/export-fixtures";

describe("exportDocx failure branches _Requirements: 5.5, 7.4_", () => {
  it("fails without a download when buildDocx rejects", async () => {
    hooks.docx = "reject";
    const store = storeWith(await gateClearDocument(), null);
    const download = vi.fn();
    const outcome = await exportDocx(store, { now: () => EXPORT_NOW, download });
    hooks.docx = "real";
    expect(outcome).toEqual({ status: "failed" });
    expect(download).not.toHaveBeenCalled();
    expect(store.getState().notice).toBe(EXPORT_FAILED);
  });

  it("fails without a download when the appendix does not parse back", async () => {
    hooks.appendix = "bad";
    const store = storeWith(await gateClearDocument(), null);
    const download = vi.fn();
    const outcome = await exportDocx(store, { now: () => EXPORT_NOW, download });
    hooks.appendix = "real";
    expect(outcome).toEqual({ status: "failed" });
    expect(download).not.toHaveBeenCalled();
    expect(store.getState().notice).toBe(EXPORT_FAILED);
  });
});
