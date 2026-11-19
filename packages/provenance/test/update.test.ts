import { createDocument, renderRecord, type Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { appearedRecord, firstRecord, updateRecord } from "../src/core/update.js";
import { advancingClock, fixedClock } from "./support/clock.js";

const W = { windowRun: "turn 2026-11-19T10:00:00Z" };
const AT = "2026-01-01T00:00:00.000Z";
const clock = fixedClock();

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}
function originAt(doc: Document, offset: number): string | undefined {
  return doc.spans.find((s) => s.start <= offset && offset < s.end)?.provenance.origin;
}

describe("updateRecord", () => {
  it("gives an Agent_Change the Runs .1 and .2 in offset order, then .3 later", () => {
    const base = must(createDocument("a\nb\nc\nd\ne\n", AT));
    const one = must(updateRecord(base, "A\nb\nc\nD\ne\n", "AI", W, clock));
    expect(one.runs.map((r) => r.runId)).toEqual([`${W.windowRun}.1`, `${W.windowRun}.2`]);
    expect(one.spans.find((s) => s.start === 0)?.provenance.runId).toBe(`${W.windowRun}.1`);
    expect(one.spans.find((s) => s.start === 6)?.provenance.runId).toBe(`${W.windowRun}.2`);
    const two = must(updateRecord(one, "A\nb\nc\nD\ne\nf\n", "AI", W, clock));
    expect(two.runs.map((r) => r.runId)).toContain(`${W.windowRun}.3`);
  });

  it("records an Outside_Change as HUM", () => {
    const base = must(createDocument("a\nb\n", AT));
    const doc = must(updateRecord(base, "a\nX\n", "HUM", null, clock));
    expect(originAt(doc, 2)).toBe("HUM");
    expect(originAt(doc, 0)).toBe("PST");
    expect(doc.runs).toEqual([]);
  });

  it("flips only the edited Hunk's Run to AI>HUM", () => {
    const ten = "123456789\n";
    const start = must(createDocument("s1\nmid\ns2\n", AT));
    const agent = must(
      updateRecord(start, `${ten}${ten}${ten}mid\n${ten}${ten}${ten}`, "AI", W, clock),
    );
    expect(agent.runs).toHaveLength(2);
    // The author deletes 20 of the 30 characters of the first Hunk's Run.
    const human = must(updateRecord(agent, agent.text.slice(20), "HUM", null, clock));
    expect(human.runs.map((r) => r.relabelled)).toEqual([true, false]);
    expect(human.spans.filter((s) => s.provenance.origin === "AI>HUM")).toHaveLength(1);
    expect(human.spans.filter((s) => s.provenance.origin === "AI")).toHaveLength(1);
  });

  it("takes no Hunk number for a delete-only Agent_Change", () => {
    const base = must(createDocument("a\nb\nc\n", AT));
    const doc = must(updateRecord(base, "a\nc\n", "AI", W, clock));
    expect(doc.runs).toEqual([]);
    expect(doc.text).toBe("a\nc\n");
  });

  it("keeps untouched text's origin and timestamp", () => {
    const base = must(createDocument("a\nb\nc\n", AT));
    const later = advancingClock(Date.UTC(2026, 5, 1));
    const doc = must(updateRecord(base, "a\nb\nc\nd\n", "AI", W, later));
    expect(doc.spans[0]?.provenance).toEqual({ origin: "PST", timestamp: AT });
  });

  it("keeps a byte order mark and carriage returns", () => {
    const text = "\uFEFFa\r\nb\r\n";
    const base = must(createDocument(text, AT));
    const doc = must(updateRecord(base, "\uFEFFa\r\nb\r\nc\r\n", "AI", W, clock));
    expect(doc.text).toBe("\uFEFFa\r\nb\r\nc\r\n");
  });

  it("leaves citation-like text unchecked and sets no result", () => {
    const base = must(createDocument("see\n", AT));
    const doc = must(updateRecord(base, "see\nRoe v. Wade, 410 U.S. 113 (1973)\n", "AI", W, clock));
    expect(doc.citations.length).toBeGreaterThan(0);
    expect(renderRecord(doc, null, "full").text).toContain("[CIT …");
    expect(doc.overrides).toEqual([]);
    expect(doc.quotes.every((q) => q.result.status === "unchecked")).toBe(true);
    for (const c of doc.citations) {
      if (c.kind === "full") expect(c.result.status).toBe("unchecked");
    }
  });

  it("returns an error value for an Agent_Change with no window", () => {
    const base = must(createDocument("a\n", AT));
    const r = updateRecord(base, "b\n", "AI", null, clock);
    expect(r.ok).toBe(false);
  });
});

describe("firstRecord", () => {
  it("leaves untouched baseline text PST at the baseline time", () => {
    const doc = must(firstRecord("a\nb\n", AT, "a\nb\nc\n", "AI", W, clock));
    expect(doc.spans[0]?.provenance).toEqual({ origin: "PST", timestamp: AT });
    expect(originAt(doc, 4)).toBe("AI");
  });

  it("without a Baseline_Text makes every character PST at the event time", () => {
    const now = "2026-03-03T03:03:03.000Z";
    const doc = must(firstRecord(null, AT, "x\ny\n", "AI", W, fixedClock(Date.parse(now))));
    expect(doc.text).toBe("x\ny\n");
    expect(doc.spans).toEqual([
      { start: 0, end: 4, provenance: { origin: "PST", timestamp: now } },
    ]);
    expect(doc.runs).toEqual([]);
  });
});

describe("appearedRecord", () => {
  it("makes the whole file one AI Run .1 inside a window", () => {
    const doc = must(appearedRecord("a\nb\n", "AI", W, clock));
    expect(doc.runs.map((r) => r.runId)).toEqual([`${W.windowRun}.1`]);
    expect(originAt(doc, 0)).toBe("AI");
  });

  it("makes the whole file HUM outside a window", () => {
    const doc = must(appearedRecord("a\nb\n", "HUM", null, clock));
    expect(originAt(doc, 3)).toBe("HUM");
  });
});
