import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { legendLines } from "../src/core/legend.js";
import { structuredSpans } from "../src/core/structured.js";
import { revealFileOutput, setupProvenanceOutput } from "../src/mcp/schemas.js";

describe("mcp output schemas", () => {
  it("accepts a reveal_file result built from structuredSpans and the legend", () => {
    const made = createDocument("ab\ncd\n", "2026-01-01T00:00:00Z");
    if (!made.ok) throw new Error("fixture document");
    const doc = made.value;
    const spans = structuredSpans(doc);
    const result = {
      file: "a.txt",
      status: "current",
      reason: null,
      unrecordedCharacters: 0,
      spans,
      legend: legendLines("run"),
      warning: null,
    };
    expect(revealFileOutput.safeParse(result).success).toBe(true);
    expect(revealFileOutput.safeParse({ ...result, warning: "No hook event." }).success).toBe(true);
    expect(revealFileOutput.safeParse({ ...result, warning: undefined }).success).toBe(false);
    expect(revealFileOutput.safeParse({ ...result, reason: "unknown" }).success).toBe(false);
    expect(revealFileOutput.safeParse({ ...result, legend: ["one"] }).success).toBe(false);
  });

  it("requires the three lists of setup_provenance", () => {
    expect(
      setupProvenanceOutput.safeParse({ written: [], replaced: [], kept: ["x"] }).success,
    ).toBe(true);
    expect(setupProvenanceOutput.safeParse({ written: [], replaced: [] }).success).toBe(false);
  });
});
