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

describe("updateRecord character trim", () => {
  const W2 = { windowRun: "turn 2026-11-19T11:00:00Z" };
  const agentDoc = () => {
    const base = must(createDocument("head\n", AT));
    return must(updateRecord(base, "head\nthe quikk fox\n", "AI", W, clock));
  };

  it("keeps the rest of an AI line AI with its Run when a person fixes one character", () => {
    const doc = must(updateRecord(agentDoc(), "head\nthe quick fox\n", "HUM", null, clock));
    expect(doc.text).toBe("head\nthe quick fox\n");
    expect(originAt(doc, 5 + 7)).toBe("HUM");
    expect(doc.spans.filter((s) => s.provenance.origin === "HUM")).toHaveLength(1);
    const ai = doc.spans.filter((s) => s.provenance.origin === "AI");
    expect(ai.length).toBeGreaterThan(0);
    expect(ai.every((s) => s.provenance.runId === `${W.windowRun}.1`)).toBe(true);
    expect(originAt(doc, 0)).toBe("PST");
  });

  it("gives an insert at the start of a line only the inserted characters", () => {
    const base = must(createDocument("line\n", AT));
    const doc = must(updateRecord(base, ">> line\n", "HUM", null, clock));
    const hum = doc.spans.filter((s) => s.provenance.origin === "HUM");
    expect(hum.map((s) => [s.start, s.end])).toEqual([[0, 3]]);
  });

  it("gives an insert at the end of a line only the inserted characters", () => {
    const base = must(createDocument("line\n", AT));
    const doc = must(updateRecord(base, "line!!\n", "HUM", null, clock));
    const hum = doc.spans.filter((s) => s.provenance.origin === "HUM");
    expect(hum.map((s) => [s.start, s.end])).toEqual([[4, 6]]);
  });

  it("keeps CR LF whole when the last character before it is edited", () => {
    const base = must(createDocument("ab\r\n", AT));
    const doc = must(updateRecord(base, "ac\r\n", "HUM", null, clock));
    expect(doc.text).toBe("ac\r\n");
    expect(originAt(doc, 1)).toBe("HUM");
    expect(originAt(doc, 2)).toBe("PST");
    expect(originAt(doc, 3)).toBe("PST");
    const crlf = must(updateRecord(must(createDocument("a\r\n", AT)), "a\n", "HUM", null, clock));
    expect(crlf.text).toBe("a\n");
  });

  it("keeps a surrogate pair whole next to and inside an edit", () => {
    const base = must(createDocument("a\u{1F600}b\n", AT));
    const doc = must(updateRecord(base, "a\u{1F680}b\n", "HUM", null, clock));
    expect(doc.text).toBe("a\u{1F680}b\n");
    expect(
      doc.spans.filter((s) => s.provenance.origin === "HUM").map((s) => [s.start, s.end]),
    ).toEqual([[1, 3]]);
  });

  it("makes no operation and takes no Run number for a Hunk that is equal after the trim", () => {
    // A Hunk from diffLines is never equal, so this is covered by trimHunk; here a no-op update.
    const doc = agentDoc();
    const same = must(updateRecord(doc, doc.text, "AI", W, clock));
    expect(same).toEqual(doc);
  });

  it("gives an Agent_Change typo fix in another window's AI line only the new character the new Run", () => {
    const doc = must(updateRecord(agentDoc(), "head\nthe quick fox\n", "AI", W2, clock));
    const runs = doc.spans
      .filter((s) => s.provenance.origin === "AI")
      .map((s) => s.provenance.runId);
    expect(runs).toContain(`${W.windowRun}.1`);
    expect(runs.filter((r) => r === `${W2.windowRun}.1`)).toHaveLength(1);
    expect(originAt(doc, 5 + 7)).toBe("AI");
    expect(doc.spans.find((s) => s.start <= 12 && 12 < s.end)?.provenance.runId).toBe(
      `${W2.windowRun}.1`,
    );
  });

  it("takes no number for a Hunk that only deletes after the trim, and the next Hunk takes .1", () => {
    const base = must(createDocument("a\nb\nx\nq\n", AT));
    const doc = must(updateRecord(base, "a\nx\nqq\n", "AI", W, clock));
    expect(doc.runs.map((r) => r.runId)).toEqual([`${W.windowRun}.1`]);
    expect(doc.spans.find((s) => s.provenance.runId === `${W.windowRun}.1`)?.start).toBe(4);
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

describe("updateRecord whole-text trim before the line difference", () => {
  const aiChars = (doc: Document): string =>
    doc.spans
      .filter((s) => s.provenance.origin === "AI")
      .map((s) => doc.text.slice(s.start, s.end))
      .join("");
  it("places an agent insert of F and a line feed before a line that starts with F at the line start (slide)", () => {
    const base = must(createDocument("head\nFoo\n", AT));
    const doc = must(updateRecord(base, "head\nF\nFoo\n", "AI", W, clock));
    expect(doc.text).toBe("head\nF\nFoo\n");
    expect(aiChars(doc)).toBe("F\n");
    expect(originAt(doc, 5)).toBe("AI");
    expect(originAt(doc, 7)).toBe("PST");
    expect(originAt(doc, 8)).toBe("PST");
  });
  it("slides an agent insert of F and a line feed to the start of the text, keeping the old line (shrunk counterexample)", () => {
    const base = must(createDocument("FH;\r\n", AT));
    const doc = must(updateRecord(base, "F\nFH;\r\n", "AI", W, clock));
    expect(doc.text).toBe("F\nFH;\r\n");
    expect(originAt(doc, 2)).toBe("PST");
    expect(aiChars(doc)).toBe("F\n");
    expect(doc.spans.filter((s) => s.provenance.origin === "AI")[0]?.start).toBe(0);
  });
  it("keeps an old line feed from inside the edited stretch that the line difference matches (shrunk counterexample)", () => {
    const base = must(createDocument("[7c57FT\n09Q\nH\n\n{gD\n", AT));
    const doc = must(updateRecord(base, "[7c57FT\n\n {gD\n", "AI", W, clock));
    expect(doc.text).toBe("[7c57FT\n\n {gD\n");
    expect(originAt(doc, 8)).toBe("PST");
    expect(
      doc.spans.filter((s) => s.provenance.origin === "AI").map((s) => [s.start, s.end]),
    ).toEqual([[9, 10]]);
  });
  // Both line feeds (the one on line 2 and the last one) are valid longest-common-subsequence
  // matches of the new text "\n". The Record follows the line difference, which pairs the new
  // line with old line 2, so the kept line feed is the PST one on line 2.
  it("keeps the line feed that the line difference pairs (line 2), when a delete leaves one of two (shrunk counterexample)", () => {
    const old = "|S3[]H7D\u{2B2F3}\n\nP]\u{34998}+\n.C9\u{32511}!&6_-\n";
    expect(old.length).toBe(29);
    const start = must(
      updateRecord(must(createDocument(old.slice(0, -1), AT)), old, "HUM", null, clock),
    );
    expect(originAt(start, 28)).toBe("HUM");
    const doc = must(updateRecord(start, "\n", "HUM", null, clock));
    expect(doc.text).toBe("\n");
    expect(originAt(doc, 0)).toBe("PST");
  });
  it("deletes one of two identical line feeds and nothing else", () => {
    const base = must(createDocument("a\n\nb\n", AT));
    const doc = must(updateRecord(base, "a\nb\n", "HUM", null, clock));
    expect(doc.text).toBe("a\nb\n");
    expect(doc.spans.every((s) => s.provenance.origin === "PST")).toBe(true);
    expect(doc.runs).toEqual([]);
  });
  describe("slide to a line start (Req 4.17)", () => {
    const aiRanges = (d: Document): number[][] =>
      d.spans.filter((x) => x.provenance.origin === "AI").map((x) => [x.start, x.end]);
    it("places a comment line added above `// b` at the start of line 2", () => {
      const base = must(createDocument("// a\n// b\n", AT));
      const doc = must(updateRecord(base, "// a\n// tip\n// b\n", "AI", W, clock));
      expect(aiRanges(doc)).toEqual([[5, 12]]);
      expect(doc.runs).toHaveLength(1);
    });
    it("places an indented line with its indent", () => {
      const base = must(createDocument("f {\n  x;\n}\n", AT));
      const doc = must(updateRecord(base, "f {\n  y;\n  x;\n}\n", "AI", W, clock));
      expect(aiRanges(doc)).toEqual([[4, 9]]);
    });
    it("slides a deletion and keeps the file text", () => {
      const base = must(createDocument("// a\n// b\n// b\n", AT));
      const doc = must(updateRecord(base, "// a\n// b\n", "HUM", null, clock));
      expect(doc.text).toBe("// a\n// b\n");
      expect(doc.spans.every((x) => x.provenance.origin === "PST")).toBe(true);
    });
    it("slides the first Hunk of an edit that has a second Hunk", () => {
      const base = must(createDocument("// a\n// b\nmid\nend\n", AT));
      const doc = must(updateRecord(base, "// a\n// x\n// b\nmid\nfin\n", "AI", W, clock));
      expect(aiRanges(doc)).toEqual([
        [5, 10],
        [19, 22],
      ]);
    });
  });
});
