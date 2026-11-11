import { apply, createDocument, parse, render } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import {
  CONTEXT_LIMIT,
  buildInsertion,
  disclosure,
  insertionLine,
  normaliseNewlines,
  nextRunId,
  paragraphAt,
} from "../src/assistant-run";
import { lineAt } from "../src/pane/layout";

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

const ISO = "2026-11-02T12:00:00.000Z";
const REPLY = "The plaintiff asks the Court to deny the motion.";

function docOf(text: string): Document {
  const created = createDocument("", ISO);
  if (!created.ok) throw new Error("fixture rejected");
  if (text === "") return created.value;
  const applied = apply(created.value, {
    kind: "insert",
    at: 0,
    text,
    provenance: { origin: "HUM", timestamp: ISO },
  });
  if (!applied.ok) throw new Error("fixture rejected");
  return applied.value.document;
}

function insertAt(text: string, caret: number, reply = REPLY) {
  const document = docOf(text);
  const { ops, run } = buildInsertion({
    document,
    runLog: [],
    caret,
    text: reply,
    prompt: "p",
    info: { provider: "fixture", modelId: null },
    timestamp: ISO,
  });
  expect(ops).toHaveLength(1);
  const op = ops[0];
  if (op === undefined) throw new Error("no op");
  const applied = apply(document, op);
  if (!applied.ok) throw new Error("apply rejected");
  return { op, run, document, applied: applied.value };
}

describe("buildInsertion paragraph boundaries _Requirements: 7.8, 24_", () => {
  it("puts the reply on its own line after a heading when the caret is at its end", () => {
    const r = insertAt("III. ARGUMENT\nNext paragraph", 13);
    expect(r.applied.document.text).toBe(`III. ARGUMENT\n${REPLY}\nNext paragraph`);
    expect(r.op).toMatchObject({ at: 13, provenance: { origin: "AI", runId: "r1" } });
    expect(r.run.runId).toBe("r1");
  });

  it("splits a paragraph with a newline on both sides when the caret is mid-paragraph", () => {
    const r = insertAt("Alpha beta", 5);
    expect(r.applied.document.text).toBe(`Alpha\n${REPLY}\n beta`);
  });

  it("adds only a trailing newline at paragraph start", () => {
    const r = insertAt("Alpha\nBeta", 6);
    expect(r.applied.document.text).toBe(`Alpha\n${REPLY}\nBeta`);
    const start = insertAt("Alpha", 0);
    expect(start.applied.document.text).toBe(`${REPLY}\nAlpha`);
  });

  it("adds only a leading newline at the end of the last paragraph", () => {
    const r = insertAt("Alpha", 5);
    expect(r.applied.document.text).toBe(`Alpha\n${REPLY}`);
  });

  it("adds no newline in an empty document", () => {
    const r = insertAt("", 0);
    expect(r.applied.document.text).toBe(REPLY);
  });

  it("adds no newline on an empty line between paragraphs", () => {
    const r = insertAt("Alpha\n\nBeta", 6);
    expect(r.applied.document.text).toBe(`Alpha\n${REPLY}\nBeta`);
  });

  it("trims newlines of the reply so no empty paragraph appears, and the AI span covers the insert", () => {
    const r = insertAt("Alpha", 5, `\r\n\n${REPLY}\n\n`);
    expect(r.applied.document.text).toBe(`Alpha\n${REPLY}`);
    expect(r.applied.document.spans.at(-1)).toMatchObject({
      start: 5,
      end: 5 + 1 + REPLY.length,
      provenance: { origin: "AI", runId: "r1" },
    });
  });

  it("undo restores the text and the Document round-trips through the codes", () => {
    const r = insertAt("III. ARGUMENT\nNext", 13);
    const back = apply(r.applied.document, r.applied.inverse);
    if (!back.ok) throw new Error("inverse rejected");
    expect(back.value.document.text).toBe(r.document.text);
    const parsed = parse(render(r.applied.document, "full").text);
    if (!parsed.ok) throw new Error("parse rejected");
    expect(parsed.value.text).toBe(r.applied.document.text);
    expect(render(parsed.value, "full").text).toBe(render(r.applied.document, "full").text);
  });
});

describe("insertionLine _Requirements: 7.5, 7.6, 7.7, 7.8, 7.9_", () => {
  function lineFor(text: string, caret: number): number {
    const r = insertAt(text, caret);
    return insertionLine(r.document.text, r.op as { at: number; text: string });
  }

  it("is the caret line at a paragraph start", () => {
    expect(lineFor("Alpha\nBeta", 6)).toBe(2);
  });

  it("is one line below the caret line mid-paragraph", () => {
    expect(lineFor("Alpha beta", 5)).toBe(2);
  });

  it("is the next line at the end of the text", () => {
    expect(lineFor("Alpha", 5)).toBe(2);
    expect(lineFor("Alpha\nBeta", 10)).toBe(3);
  });

  it("is line 1 at offset 0", () => {
    expect(lineFor("Alpha", 0)).toBe(1);
    expect(lineFor("", 0)).toBe(1);
  });

  it("counts earlier lines in multi-line text", () => {
    expect(lineFor("a\nb\nc d\ne", 5)).toBe(4);
  });

  it("differs from the caret line after the insertion", () => {
    const r = insertAt("Alpha beta", 5);
    const caretLineAfter = lineAt(r.applied.document.text, 5);
    expect(insertionLine(r.document.text, r.op as { at: number; text: string })).toBe(2);
    expect(caretLineAfter).toBe(1);
  });
});
