import { createDocument, render, setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import {
  codeFamily,
  codeMeaning,
  itemIndexAtOffset,
  layoutPane,
  lineAt,
  lnPos,
  offsetOfItem,
  statusText,
} from "../src/pane/layout";

const ISO = "2026-01-01T00:00:00.000Z";

function docOf(text: string): Document {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture document rejected");
  return created.value;
}

describe("codeFamily _Requirements: 11.5_", () => {
  it.each([
    ["[HUM]", "HUM"],
    ["[PST]", "PST"],
    ["[AI:r1]", "AI"],
    ["[AI>HUM:r1]", "AI>HUM"],
    ["[CIT ✓]", "verified"],
    ["[QUO ✓]", "verified"],
    ["[CIT ✘]", "failed"],
    ["[QUO ✘]", "failed"],
    ["[CIT ?:2]", "pending"],
    ["[CIT …]", "pending"],
    ["[QUO …]", "pending"],
    ["[OVR:reason with : colons]", "ovr"],
    ["[REF]", "ref"],
    ["[/CIT]", "close"],
    ["[/QUO]", "close"],
    ["[/REF]", "close"],
  ] as const)("%s is %s", (token, family) => {
    expect(codeFamily(token)).toBe(family);
  });

  it("accepts a token without its brackets", () => {
    expect(codeFamily("CIT ?:2")).toBe("pending");
  });
});

describe("codeMeaning _Requirements: 11.5_", () => {
  it("names the outcome", () => {
    expect(codeMeaning("[CIT ✘]")).toBe("Citation not found");
    expect(codeMeaning("[/QUO]")).toBe("End of quote");
    expect(codeMeaning("[CIT ?:2]")).toBe("Citation ambiguous, 2 candidates");
  });

  it("carries the run id", () => {
    expect(codeMeaning("[AI:r1]")).toBe("Inserted by the assistant, run r1");
    expect(codeMeaning("[AI>HUM:r1]")).toContain("run r1");
  });

  it("strips payload escapes and keeps colons in an override reason", () => {
    expect(codeMeaning("[OVR:why \\[a\\]: b \\\\ c]")).toBe("Override: why [a]: b \\ c");
  });
});

describe("layoutPane _Requirements: 11.1, 11.2, 11.3, 11.4_", () => {
  it("emits n + m items for n code points and m positions", () => {
    const doc = docOf("ab😀\nc");
    const layout = layoutPane(doc);
    const m = render(doc, "display").positions.length;
    expect(layout.items).toHaveLength(Array.from(doc.text).length + m);
    expect(layout.textLength).toBe(doc.text.length);
  });

  it("puts the code before the text at the same offset and offsets after surrogate pairs", () => {
    const layout = layoutPane(docOf("a😀b"));
    const texts = layout.items.filter((i) => i.kind === "text");
    expect(texts.map((i) => [i.offset, i.text])).toEqual([
      [0, "a"],
      [1, "😀"],
      [3, "b"],
    ]);
    expect(layout.items[0]?.kind).toBe("code");
    expect(layout.items[0]?.offset).toBe(0);
  });

  it("keeps the escaping backslash attached to brackets and backslashes", () => {
    const doc = docOf("[a]\\");
    const texts = layoutPane(doc).items.filter((i) => i.kind === "text");
    expect(texts.map((i) => i.text)).toEqual(["\\[", "a", "\\]", "\\\\"]);
    expect(texts.map((i) => i.offset)).toEqual([0, 1, 2, 3]);
  });

  it("rebuilds the display rendering and reads code offsets from positions", () => {
    const doc = docOf("See Roe v. Wade, 410 U.S. 113 (1973).");
    const rendering = render(doc, "display");
    const layout = layoutPane(doc);
    expect(layout.items.map((i) => i.text).join("")).toBe(rendering.text);
    const codes = layout.items.filter((i) => i.kind === "code");
    expect(codes.map((c) => [c.offset, c.text])).toEqual(
      rendering.positions.map((p) => [p.offset, p.code]),
    );
    expect(codes.some((c) => c.family === "pending")).toBe(true);
  });

  it("places a code at the text length after the last text item", () => {
    const doc = docOf("See 410 U.S. 113");
    const layout = layoutPane(doc);
    const last = layout.items[layout.items.length - 1];
    expect(last?.kind).toBe("code");
    expect(last?.text).toBe("[/CIT]");
    expect(last?.offset).toBe(doc.text.length);
    expect(layout.items[layout.items.length - 2]?.kind).toBe("text");
  });

  it("lays out the empty document as codes only", () => {
    const layout = layoutPane(docOf(""));
    expect(layout.items.every((i) => i.kind === "code")).toBe(true);
    expect(layout.textLength).toBe(0);
  });
});

describe("itemIndexAtOffset and offsetOfItem _Requirements: 11.6_", () => {
  const layout = layoutPane(docOf("a😀b"));
  const indexOfText = (o: number): number =>
    layout.items.findIndex((i) => i.kind === "text" && i.offset === o);

  it("finds the text item at 0, mid-text and inside a pair", () => {
    expect(itemIndexAtOffset(layout, 0)).toBe(indexOfText(0));
    expect(itemIndexAtOffset(layout, 1)).toBe(indexOfText(1));
    expect(itemIndexAtOffset(layout, 2)).toBe(indexOfText(1));
    expect(itemIndexAtOffset(layout, 3)).toBe(indexOfText(3));
  });

  it("returns the index after the last text item at the end position", () => {
    expect(itemIndexAtOffset(layout, 4)).toBe(indexOfText(3) + 1);
  });

  it("inverts through offsetOfItem", () => {
    for (const o of [0, 1, 3]) {
      expect(offsetOfItem(layout, itemIndexAtOffset(layout, o))).toBe(o);
    }
  });
});

describe("failing flag in layoutPane _Requirements: 3.4, 3.6, 12.14_", () => {
  function failedDoc(): Document {
    const base = docOf('See Roe v. Wade, 410 U.S. 113, 120 (1973) ("the quick brown fox").');
    const cit = base.citations.find((c) => c.kind === "full");
    const q = base.quotes[0];
    if (cit === undefined || cit.kind !== "full" || q === undefined) throw new Error("fixture");
    const a = setVerification(base, cit.key, { status: "not_found" });
    if (!a.ok) throw new Error("fixture citation rejected");
    const b = setQuoteCheck(a.value, q.key, { status: "mismatch", prefixLength: 4 });
    if (!b.ok) throw new Error("fixture quote rejected");
    return b.value;
  }

  it("flags failing openings and closers, keeping text and offsets of the display rendering", () => {
    const doc = failedDoc();
    const rendering = render(doc, "display");
    const codes = layoutPane(doc).items.filter((i) => i.kind === "code");
    expect(codes.map((c) => [c.text, c.failing])).toEqual(
      rendering.positions.map((p) => [p.code, p.code !== "[PST]"]),
    );
    expect(codes.map((c) => c.offset)).toEqual(rendering.positions.map((p) => p.offset));
  });

  it("does not flag the closer of a verified citation or other codes", () => {
    const doc = docOf("See Roe v. Wade, 410 U.S. 113 (1973).");
    const verified = setVerification(
      doc,
      (doc.citations.find((c) => c.kind === "full") as { key: string }).key,
      { status: "verified", clusterId: "1" },
    );
    if (!verified.ok) throw new Error("fixture rejected");
    const codes = layoutPane(verified.value).items.filter((i) => i.kind === "code");
    expect(codes.some((c) => c.text === "[/CIT]")).toBe(true);
    expect(codes.every((c) => !c.failing)).toBe(true);
  });
});

describe("lineAt and lnPos _Requirements: 3.8_", () => {
  it("numbers lines from 1 and clamps the offset", () => {
    expect(lineAt("ab\ncd", 0)).toBe(1);
    expect(lineAt("ab\ncd", 3)).toBe(2);
    expect(lineAt("ab\ncd", 99)).toBe(2);
    expect(lineAt("ab\ncd", -4)).toBe(1);
  });

  it("builds the position part of the status text", () => {
    expect(lnPos("ab\ncd", 4)).toBe("Ln 2 Pos 2");
    expect(statusText("ab\ncd", 4)).toBe(`Doc 1 Pg 1 ${lnPos("ab\ncd", 4)}`);
  });
});

describe("statusText _Requirements: 11.7_", () => {
  it("counts lines and columns in code units", () => {
    expect(statusText("", 0)).toBe("Doc 1 Pg 1 Ln 1 Pos 1");
    expect(statusText("ab\ncd", 2)).toBe("Doc 1 Pg 1 Ln 1 Pos 3");
    expect(statusText("ab\ncd", 3)).toBe("Doc 1 Pg 1 Ln 2 Pos 1");
    expect(statusText("ab\n😀x", 6)).toBe("Doc 1 Pg 1 Ln 2 Pos 4");
  });
});
