import { describe, expect, it } from "vitest";
import { excerptPair } from "../src/excerpt.js";
import { deriveFindings } from "../src/findings.js";
import { buildDemoDocument } from "./support/export-support.js";

const MAX = 80;
const tail = (n: number): string => "c".repeat(n);

describe("excerptPair (Requirement 14, criteria 3 and 4)", () => {
  it("shows lines of at most 80 units whole, without marks", () => {
    const b = "a".repeat(80);
    const a = `${"a".repeat(79)}b`;
    expect(excerptPair(b, a, MAX)).toEqual([b, a]);
  });

  it("starts at 0 with no leading mark when the difference is within the first 30 units", () => {
    const [b, a] = excerptPair(`ab${tail(150)}`, `aX${tail(150)}`, MAX);
    expect(b.startsWith("ab")).toBe(true);
    expect(a.startsWith("aX")).toBe(true);
  });

  it("starts at 0 for a difference at exactly index 30", () => {
    const p = "p".repeat(30);
    const [b, a] = excerptPair(`${p}1${tail(100)}`, `${p}2${tail(100)}`, MAX);
    expect(b.startsWith(`${p}1`)).toBe(true);
    expect(a.startsWith(`${p}2`)).toBe(true);
  });

  it("starts at 1 with a leading mark for a difference at index 31", () => {
    const p = "p".repeat(31);
    const [b, a] = excerptPair(`${p}1${tail(100)}`, `${p}2${tail(100)}`, MAX);
    expect(b.startsWith(`…${"p".repeat(30)}1`)).toBe(true);
    expect(a.startsWith(`…${"p".repeat(30)}2`)).toBe(true);
  });

  it("tells a line that is a prefix of the other from it", () => {
    const short = "s".repeat(60);
    const [b, a] = excerptPair(short, `${short}${tail(100)}`, MAX);
    expect(b).toBe(`…${"s".repeat(30)}`);
    expect(a).toBe(`…${"s".repeat(30)}${tail(49)}…`);
  });

  it("tells an absent line from a long line", () => {
    const [b, a] = excerptPair("", tail(200), MAX);
    expect(b).toBe("");
    expect(a).toBe(`${tail(79)}…`);
  });

  it("backs up one unit when the start would split a surrogate pair", () => {
    const prefix = `${"a".repeat(10)}😀${"b".repeat(29)}`;
    expect(prefix.length).toBe(41);
    const [b, a] = excerptPair(`${prefix}X${tail(100)}`, `${prefix}Y${tail(100)}`, MAX);
    expect(b.startsWith("…😀b")).toBe(true);
    expect(a.startsWith("…😀b")).toBe(true);
  });

  it("ends before a pair that straddles the cut", () => {
    const [b, a] = excerptPair(`${"a".repeat(78)}😀${tail(20)}`, `z${tail(150)}`, MAX);
    expect(b).toBe(`${"a".repeat(78)}…`);
    expect(a).not.toBe(b);
  });
});

describe("body_edited on the demo motion (Requirement 14, criterion 7)", () => {
  it("windows both cells around the edit on line 30", async () => {
    const doc = await buildDemoDocument();
    const lines = doc.text.split("\n");
    const from = "timing alone is enough at the pleading stage";
    const to = "timing alone is always enough at every stage";
    const line = lines[29] ?? "";
    expect(line).toContain(from);
    const body = [...lines.slice(0, 29), line.replace(from, to), ...lines.slice(30)].join("\n");
    const found = deriveFindings({
      file: "motion.docx",
      recorded: doc,
      bodyText: body,
      outcome: { document: doc, unavailable: null, notRechecked: [] },
    });
    expect(found).toHaveLength(1);
    const f = found[0];
    expect(f).toMatchObject({ kind: "body_edited", line: 30 });
    if (f === undefined) return;
    expect(f.before).not.toBe(f.after);
    for (const cell of [f.before, f.after]) {
      expect(cell).toContain("timing alone is");
      expect(cell.startsWith("…")).toBe(true);
      expect(cell.length).toBeLessThanOrEqual(82);
    }
  });
});
