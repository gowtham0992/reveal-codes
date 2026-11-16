import { describe, expect, it } from "vitest";
import { APPENDIX_TITLE, exportDate, readWordDraft } from "../src/index.js";
import {
  buildFixtureDocx,
  exportAndEditedExport,
  oversizePartZip,
  passwordProtectedStandIn,
  truncatedZip,
} from "./support/docx-fixtures.js";

const LIMITS = { maxPartBytes: 50_000_000 };

describe("exportDate", () => {
  it("reads the line before the last Appendix title only when it has the date shape", () => {
    expect(exportDate(["x", "2026-11-20", APPENDIX_TITLE, "a"])).toBe("2026-11-20");
    expect(exportDate(["x", "20 Nov 2026", APPENDIX_TITLE])).toBeNull();
    expect(exportDate([APPENDIX_TITLE])).toBeNull();
    expect(exportDate(["2026-11-20"])).toBeNull();
  });
});

describe("readWordDraft", () => {
  it("refuses encrypted, truncated and oversize files", () => {
    expect(readWordDraft(passwordProtectedStandIn(), LIMITS)).toEqual({
      kind: "refused",
      reason: "encrypted",
    });
    const compound = passwordProtectedStandIn().fill(0, 1024);
    expect(readWordDraft(compound, LIMITS)).toEqual({ kind: "refused", reason: "damaged" });
    expect(readWordDraft(truncatedZip(new Uint8Array(400).fill(7)), LIMITS).kind).toBe("refused");
    expect(readWordDraft(oversizePartZip(), { maxPartBytes: 5 })).toEqual({
      kind: "refused",
      reason: "damaged",
    });
  });

  it("reads a file with no Appendix as plain text with its footnotes", async () => {
    const draft = readWordDraft(await buildFixtureDocx(), LIMITS);
    expect(draft.kind).toBe("plain");
    if (draft.kind === "plain") {
      expect(draft.text).toContain("First paragraph.");
      expect(draft.text).toContain("\n\nFootnotes\n1. First footnote.");
    }
  });

  it("restores an untouched export and reports a one-character edit as changed", async () => {
    const { original, edited } = await exportAndEditedExport();
    const restored = readWordDraft(original, LIMITS);
    expect(restored.kind).toBe("restored");
    if (restored.kind === "restored") {
      expect(restored.exportedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const changed = readWordDraft(edited, LIMITS);
    expect(changed.kind).toBe("changed");
    if (changed.kind === "changed" && restored.kind === "restored") {
      expect(changed.text).not.toBe(restored.record.document.text);
      expect(changed.text).toHaveLength(restored.record.document.text.length);
    }
  });
});
