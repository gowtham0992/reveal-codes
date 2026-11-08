import { createDocument } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_LIMIT,
  disclosure,
  normaliseNewlines,
  nextRunId,
  paragraphAt,
} from "../src/assistant-run";

describe("assistant-run _Requirements: 22.7, 23.1, 23.4, 23.5_", () => {
  it("takes only the paragraph holding the offset", () => {
    const text = "one\ntwo two\nthree";
    expect(paragraphAt(text, 0)).toBe("one");
    expect(paragraphAt(text, 3)).toBe("one");
    expect(paragraphAt(text, 4)).toBe("two two");
    expect(paragraphAt(text, 17)).toBe("three");
  });

  it("cuts a long paragraph to its last 4 000 code units without a lone low surrogate", () => {
    const text = "a" + "😀".repeat(CONTEXT_LIMIT);
    const cut = paragraphAt(text, 0);
    expect(cut.length).toBeLessThanOrEqual(CONTEXT_LIMIT);
    expect(cut.codePointAt(0)).toBe(0x1f600);
  });

  it("normalises CRLF and CR to LF", () => {
    expect(normaliseNewlines("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("numbers runs from the larger of the Engine runs and the log", () => {
    const doc = createDocument("", "2026-01-01T00:00:00.000Z");
    if (!doc.ok) throw new Error("fixture rejected");
    const entry = { runId: "r1", provider: "x", modelId: null, prompt: "p", timestamp: "t" };
    expect(nextRunId(doc.value, [])).toBe("r1");
    expect(nextRunId(doc.value, [entry, { ...entry, runId: "r2" }])).toBe("r3");
  });

  it("words the disclosure by provider", () => {
    expect(disclosure({ provider: "anthropic", modelId: "m" })).toBe(
      "Draft sends your prompt and the paragraph at the cursor to Anthropic.",
    );
    expect(disclosure({ provider: "bedrock", modelId: "m" })).toContain("Amazon Bedrock");
    expect(disclosure({ provider: "fixture", modelId: null })).toContain("nothing is sent");
  });
});
