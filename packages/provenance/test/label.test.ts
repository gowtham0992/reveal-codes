import { apply, createDocument, parseRecord, renderRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import {
  describeRun,
  makeLabel,
  parseRunId,
  parseTaskName,
  runId,
  windowRunName,
} from "../src/core/label.js";
import { parsePayload } from "../src/core/payload.js";

const TIME = "2026-11-19T10:00:00Z";

function reads(taskName: string | null): string {
  const l = parseTaskName(taskName);
  return describeRun(l.taskNumber, l.title);
}

describe("parseTaskName", () => {
  it("splits the Task_Number from the title", () => {
    expect(parseTaskName("5.3 Build the view")).toEqual({
      taskNumber: "5.3",
      title: "Build the view",
    });
    expect(reads("5.3 Build the view")).toBe("written in task 5.3 Build the view");
  });

  it("drops the trailing dot of the Task_Number", () => {
    expect(parseTaskName("1. Probe task one")).toEqual({
      taskNumber: "1",
      title: "Probe task one",
    });
  });

  it("gives no number to a name without a leading token", () => {
    expect(parseTaskName("Build the view")).toEqual({ taskNumber: null, title: "Build the view" });
    expect(parseTaskName("2024plan")).toEqual({ taskNumber: null, title: "2024plan" });
  });

  it("keeps the number and the title `task` for a number alone", () => {
    expect(parseTaskName("5.3")).toEqual({ taskNumber: "5.3", title: "task" });
    expect(reads("5.3")).toBe("written in task 5.3");
  });

  it("gives (none, task) for an absent and an empty name", () => {
    for (const name of [null, "", "  \t\n "]) {
      expect(parseTaskName(name)).toEqual({ taskNumber: null, title: "task" });
      expect(reads(name)).toBe("written in task");
    }
  });

  it("collapses whitespace and control characters to single spaces", () => {
    expect(parseTaskName("  5.3\u0000 Build \n\t the\u001fview ")).toEqual({
      taskNumber: "5.3",
      title: "Build the view",
    });
  });

  it("cuts at 80 code points and never inside a surrogate pair", () => {
    const title = "a".repeat(79) + "\u{1F600}" + "b";
    const cut = parseTaskName(title).title;
    expect(Array.from(cut)).toHaveLength(80);
    expect(cut.endsWith("\u{1F600}")).toBe(true);
    expect(cut).toBe("a".repeat(79) + "\u{1F600}");
  });

  it("keeps dots, digits and brackets in a title", () => {
    expect(parseTaskName("2.1 Fix [v1.2] and 3.4.5 x")).toEqual({
      taskNumber: "2.1",
      title: "Fix [v1.2] and 3.4.5 x",
    });
  });

  it("reads only task_name: a payload with `task` and no `task_name` gives `task`", () => {
    const payload = parsePayload(JSON.stringify({ task: "9.9 Secret title" }));
    expect(parseTaskName(payload.taskName)).toEqual({ taskNumber: null, title: "task" });
  });
});

describe("parseTaskName: DEL and C1 controls (Property 10 counterexample)", () => {
  it("turns DEL and C1 controls into single spaces, like the C0 controls", () => {
    expect(parseTaskName("a\u007fb\u0085\u009fc")).toEqual({ taskNumber: null, title: "a b c" });
    expect(parseTaskName("\u007f")).toEqual({ taskNumber: null, title: "task" });
  });
});

describe("makeLabel and describeRun", () => {
  it("gives a turn window the title `turn` and no number whatever the name", () => {
    expect(makeLabel("5.3 Build", "promptSubmit")).toEqual({ taskNumber: null, title: "turn" });
    expect(describeRun(null, "turn")).toBe("written in turn");
  });

  it("uses the task name for preTask", () => {
    expect(makeLabel("5.3 Build", "preTask")).toEqual(parseTaskName("5.3 Build"));
  });
});

describe("windowRunName and Run_Ids", () => {
  it("builds the name with and without a Task_Number", () => {
    expect(windowRunName("5.3", "Build", TIME, [])).toBe(`5.3 Build ${TIME}`);
    expect(windowRunName(null, "turn", TIME, [])).toBe(`turn ${TIME}`);
  });

  it("appends ~2, ~3 only when the name is taken", () => {
    const first = windowRunName(null, "turn", TIME, []);
    const second = windowRunName(null, "turn", TIME, [first]);
    const third = windowRunName(null, "turn", TIME, [first, second]);
    expect(second).toBe(`${first}~2`);
    expect(third).toBe(`${first}~3`);
    expect(windowRunName(null, "turn", "2026-11-19T10:00:01Z", [first])).toBe(
      "turn 2026-11-19T10:00:01Z",
    );
  });

  it("reads a Run_Id back", () => {
    const id = runId(windowRunName("5.3", "Build [x]. 2", TIME, [`5.3 Build [x]. 2 ${TIME}`]), 7);
    expect(parseRunId(id)).toEqual({
      taskNumber: "5.3",
      title: "Build [x]. 2",
      time: TIME,
      suffix: 2,
      n: 7,
    });
  });

  it("gives the title `?` to an id that does not match", () => {
    expect(parseRunId("manual-run-1")).toEqual({
      taskNumber: null,
      title: "?",
      time: null,
      suffix: null,
      n: null,
    });
  });
});

describe("Run_Ids through the Engine's escaping", () => {
  it("round-trips renderRecord and parseRecord with spaces, dots, brackets", () => {
    const l = parseTaskName("5.3 Fix [a]{b}; x=1, \\ end");
    const id = runId(windowRunName(l.taskNumber, l.title, TIME, []), 1);
    const created = createDocument("", TIME);
    if (!created.ok) throw new Error("createDocument failed");
    const applied = apply(created.value, {
      kind: "insert",
      at: 0,
      text: "hello",
      provenance: { origin: "AI", runId: id, timestamp: TIME },
    });
    if (!applied.ok) throw new Error("apply failed");
    const doc = applied.value.document;
    const full = renderRecord(doc, null, "full").text;
    const parsed = parseRecord(full);
    if (!parsed.ok) throw new Error("parseRecord failed");
    expect(parsed.value.document.runs.map((r) => r.runId)).toEqual([id]);
    expect(parsed.value.document.spans.map((s) => s.provenance.runId)).toEqual([id]);
    expect(parseRunId(id).taskNumber).toBe("5.3");
  });
});
