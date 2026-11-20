import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { noPromptSessionsLine } from "../src/core/legend.js";
import {
  formatShare,
  summarize,
  type SummaryInput,
  type SummaryRecord,
} from "../src/core/summary.js";

type S = Document["spans"][number];
const AT = "2026-11-19T10:00:00.000Z";
const T53 = "5.3 Build the view 2026-11-19T10:01:00Z";
const TURN = "turn 2026-11-19T10:05:00Z";
const span = (
  start: number,
  end: number,
  origin: S["provenance"]["origin"],
  runId?: string,
): S => ({
  start,
  end,
  provenance: runId === undefined ? { origin, timestamp: AT } : { origin, runId, timestamp: AT },
});
const rec = (path: string, text: string, spans: S[], stale = false): SummaryRecord => ({
  path,
  doc: { text, spans },
  stale,
});
const base = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  records: [],
  unchanged: [],
  path: null,
  sessions: 0,
  ...over,
});
const a = rec("src/a.ts", "aaaa\nbbbb\ncc\n", [
  span(0, 5, "AI", `${T53}.1`),
  span(5, 10, "HUM"),
  span(10, 13, "AI>HUM", `${T53}.2`),
]);
const b = rec("src/b.ts", "xxxxx\nyy\n", [span(0, 6, "AI", `${TURN}.1`), span(6, 9, "PST")]);
const c = rec("lib/c.ts", "zzzzz\n", [span(0, 6, "AI", `${T53}.1`)]);
const unchanged = [{ path: "README.md", length: 20, stale: false }];

describe("summarize", () => {
  it("counts per file and in total, with an Unchanged_File as PST", () => {
    const out = summarize(base({ records: [a, b, c], unchanged }));
    const s = out.summary;
    expect(s?.files.map((f) => f.path)).toEqual(["README.md", "lib/c.ts", "src/a.ts", "src/b.ts"]);
    expect(s?.files[0]?.counts).toEqual({ AI: 0, "AI>HUM": 0, HUM: 0, PST: 20 });
    expect(s?.total).toEqual({ AI: 17, "AI>HUM": 3, HUM: 5, PST: 23 });
    expect(s?.totalCharacters).toBe(48);
    expect(out.text).toContain(
      "src/a.ts: 13 characters: AI 5 (38.5%), AI>HUM 3 (23.1%), HUM 5 (38.5%), PST 0 (0.0%)",
    );
    expect(out.status).toBe(0);
  });

  it("lists AI stretches only, longest first, and counts the AI>HUM left out", () => {
    const s = summarize(base({ records: [a, b, c] })).summary;
    expect(s?.stretches.map((x) => [x.path, x.length])).toEqual([
      ["lib/c.ts", 6],
      ["src/b.ts", 6],
      ["src/a.ts", 5],
    ]);
    expect(s?.omittedAiHuman).toBe(3);
  });

  it("honours --top", () => {
    const s = summarize(base({ records: [a, b, c], top: 2 })).summary;
    expect(s?.stretches).toHaveLength(2);
  });

  it("orders equal lengths by path, then offset", () => {
    const d = rec("src/d.ts", "1234\n5678\n", [
      span(0, 5, "AI", `${T53}.1`),
      span(5, 10, "AI", `${T53}.2`),
    ]);
    const s = summarize(base({ records: [d, a] })).summary;
    expect(s?.stretches.map((x) => [x.path, x.offset])).toEqual([
      ["src/a.ts", 0],
      ["src/d.ts", 0],
      ["src/d.ts", 5],
    ]);
  });

  it("gives first and last line of a stretch that ends on a newline", () => {
    const s = summarize(base({ records: [a] })).summary;
    expect(s?.stretches[0]).toMatchObject({ firstLine: 1, lastLine: 1, length: 5 });
    const e = rec("e.ts", "1\n2\n3", [span(0, 5, "AI", `${T53}.1`)]);
    expect(summarize(base({ records: [e] })).summary?.stretches[0]).toMatchObject({
      firstLine: 1,
      lastLine: 3,
    });
  });

  it("marks a stale file", () => {
    const out = summarize(base({ records: [{ ...a, stale: true }, b] }));
    expect(out.text).toContain("src/a.ts (stale):");
    expect(out.text).not.toContain("src/b.ts (stale)");
  });

  it("limits the output to a file path or a directory path", () => {
    const records = [a, b, c];
    const file = summarize(base({ records, path: "src/a.ts" })).summary;
    expect(file?.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    const dir = summarize(base({ records, path: "src/" })).summary;
    expect(dir?.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(summarize(base({ records, path: "src/a" })).summary).toBeNull();
  });

  it("prints one line naming setup_provenance and status 1 when nothing is recorded", () => {
    const out = summarize(base({ sessions: 7 }));
    expect(out.status).toBe(1);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toContain("setup_provenance");
  });

  it("groups by Window_Run across two files, ordered by opening time", () => {
    const rows = summarize(base({ records: [b, a, c] })).summary?.windows;
    expect(rows).toEqual([
      expect.objectContaining({
        windowRun: T53,
        taskNumber: "5.3",
        title: "Build the view",
        files: 3 - 1,
        runs: 3,
        ai: 11,
        aiHuman: 3,
      }),
      expect.objectContaining({
        windowRun: TURN,
        taskNumber: null,
        title: "turn",
        files: 1,
        runs: 1,
        ai: 6,
        aiHuman: 0,
      }),
    ]);
  });

  it("says where the text was written", () => {
    const out = summarize(base({ records: [a, b] }));
    expect(out.text).toContain(
      `src/a.ts line 1, 5 characters, written in task 5.3 Build the view, ${T53}`,
    );
    expect(out.text).toContain("written in turn");
    const fallback = rec("f.ts", "f\n", [span(0, 2, "AI", "task 2026-11-19T10:09:00Z.1")]);
    expect(summarize(base({ records: [fallback] })).text).toContain("written in task,");
  });

  it("prints the notice once and gives the same string twice", () => {
    const input = base({ records: [a, b, c], unchanged, sessions: 1 });
    const first = summarize(input).text;
    expect(summarize(input).text).toBe(first);
    expect(first.split("changed while no agent window was open").length - 1).toBe(1);
  });

  it("prints the sessions line for 1 and 7, none for 0, and an unreadable line", () => {
    const text = (sessions: SummaryInput["sessions"]): string =>
      summarize(base({ records: [a], sessions })).text;
    expect(text(0)).not.toContain("Sessions with no prompt events");
    expect(text(1)).toContain(noPromptSessionsLine(1));
    expect(text(7)).toContain(noPromptSessionsLine(7));
    expect(text("unreadable")).toContain("unreadable");
    expect(summarize(base({ records: [a], sessions: "unreadable" })).status).toBe(0);
    expect(summarize(base({ records: [a], path: "src/b.ts", sessions: 7 })).text).toContain(
      noPromptSessionsLine(7),
    );
  });
});

describe("formatShare", () => {
  it("prints one decimal", () => {
    expect(formatShare(1, 3)).toBe("33.3");
    expect(formatShare(3, 3)).toBe("100.0");
    expect(formatShare(0, 0)).toBe("0.0");
  });
});
