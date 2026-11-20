import { describe, expect, it } from "vitest";
import {
  HOUR_MS,
  PROV,
  ROOT,
  entryOf,
  fixture,
  logLines,
  manual,
  pieces,
  play,
  sessionCount,
  stateOf,
  step,
  synthetic,
  windowRuns,
  workspace,
  write,
} from "./support/event-harness.js";

const A = "sess-A";
const C = "sess-C";
const F = "sess-F";

describe("each captured Hook_Event, each surface (Req 16.6)", () => {
  it("IDE chat: promptSubmit opens a turn window, the write lands in it, agentStop closes it", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    const win = (await windowRuns(deps, A))[0] ?? "";
    expect(win).toMatch(/^turn \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u);
    expect((await entryOf(deps, A)).promptSeen).toBe(true);
    write(deps, "a.txt", "one\n");
    await play(deps, step("ide/stop.json"));
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "AI", runId: `${win}.1`, text: "one\n" }]);
    expect((await entryOf(deps, A)).windows).toEqual([]);
    expect(logLines(deps)).toEqual([]);
  });

  it("IDE Specs panel: preTask and postTask give a task window named by the fixture's task_name", async () => {
    const deps = workspace();
    await play(deps, step("ide/pre-task-exec.json"));
    const open = (await entryOf(deps, C)).windows;
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      kind: "task",
      taskNumber: "2",
      label: "Probe task two",
      spec: "probe-scratch",
    });
    write(deps, "a.txt", "probe\n");
    await play(deps, step("ide/post-task-exec.json"));
    const run = open[0]?.windowRun ?? "";
    expect(run.startsWith("2 Probe task two ")).toBe(true);
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "AI", runId: `${run}.1`, text: "probe\n" }]);
    expect((await entryOf(deps, C)).windows).toEqual([]);
  });

  it("IDE tab B and the extra IDE session are sessions of their own", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit-tab-b.json"));
    await play(deps, step("ide/extra-session.json", 0));
    expect(Object.keys((await stateOf(deps)).sessions).sort()).toEqual(["sess-B", "sess-E"]);
    await play(deps, step("ide/extra-session.json", 1));
    await play(deps, step("ide/stop-tab-b.json"));
    expect(Object.values((await stateOf(deps)).sessions).map((s) => s.windows)).toEqual([[], []]);
    expect(logLines(deps)).toEqual([]);
  });

  it("CLI: promptSubmit and agentStop of the fixture turn", async () => {
    const deps = workspace();
    await play(deps, step("cli/user-prompt-submit.json"));
    write(deps, "c.txt", "cli\n");
    await play(deps, step("cli/stop.json"));
    expect(pieces(deps, "c.txt").map((p) => p.origin)).toEqual(["AI"]);
    expect(pieces(deps, "c.txt")[0]?.runId?.startsWith("turn ")).toBe(true);
  });

  it("the CLI has no task fixture: its task events are not part of the fixtures", () => {
    expect(fixture("cli/turn-without-task-events.json").map((s) => s.event)).toEqual([
      "promptSubmit",
      "agentStop",
    ]);
  });
});

describe("IDE and CLI with overlapping windows (Req 16.19)", () => {
  it("attributes each change to the stopping session's window, then the third to nobody", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    await play(deps, step("cli/user-prompt-submit.json"));
    const ide = (await windowRuns(deps, A))[0] ?? "";
    const cli = (await windowRuns(deps, F))[0] ?? "";
    expect(ide).not.toBe(cli);

    write(deps, "f.txt", "one\n");
    await play(deps, step("ide/stop.json"));
    expect(pieces(deps, "f.txt")).toEqual([{ origin: "AI", runId: `${ide}.1`, text: "one\n" }]);
    expect((await entryOf(deps, A)).windows).toEqual([]);
    expect(await windowRuns(deps, F)).toEqual([cli]);

    write(deps, "f.txt", "one\ntwo\n");
    await play(deps, step("cli/stop.json"));
    expect(pieces(deps, "f.txt")).toEqual([
      { origin: "AI", runId: `${ide}.1`, text: "one\n" },
      { origin: "AI", runId: `${cli}.1`, text: "two\n" },
    ]);
    expect((await entryOf(deps, F)).windows).toEqual([]);

    write(deps, "f.txt", "one\ntwo\nthree\n");
    await play(deps, manual);
    expect(pieces(deps, "f.txt").at(-1)).toEqual({ origin: "HUM", runId: null, text: "three\n" });
    expect(logLines(deps)).toEqual([]);
  });
});

describe("an event with no session_id or an empty one (Req 3.22)", () => {
  it("uses the _none key and logs no_session_id once per lifetime of state.json", async () => {
    const deps = workspace();
    await play(deps, synthetic("promptSubmit", null));
    expect(Object.keys((await stateOf(deps)).sessions)).toEqual(["_none"]);
    expect(logLines(deps)).toEqual(["promptSubmit - no_session_id"]);
    await play(deps, synthetic("promptSubmit", ""));
    expect(logLines(deps)).toEqual([
      "promptSubmit - no_session_id",
      "promptSubmit - window_left_open",
    ]);
    deps.fs.files.delete(`${PROV}/state.json`);
    await play(deps, synthetic("promptSubmit", null));
    expect(logLines(deps).filter((l) => l.endsWith("no_session_id"))).toHaveLength(2);
    expect((await stateOf(deps)).noSessionIdLogged).toBe(true);
  });
});

describe("rule 21 across sessions", () => {
  it("attributes a change at an event of a session with no window to the window of another session", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    const win = (await windowRuns(deps, A))[0] ?? "";
    write(deps, "a.txt", "x\n");
    await play(deps, step("ide/stop-tab-b.json"));
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "AI", runId: `${win}.1`, text: "x\n" }]);
    expect(await windowRuns(deps, A)).toEqual([win]);
    expect(logLines(deps)).toEqual(["agentStop - no_open_window"]);
    expect(await sessionCount(deps)).toBe(0);
  });

  it("picks the window opened last when two other sessions opened theirs in the same second", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    await play(deps, step("ide/extra-session.json", 0), 0);
    const first = (await windowRuns(deps, A))[0] ?? "";
    const second = (await windowRuns(deps, "sess-E"))[0] ?? "";
    expect(second).toBe(`${first}~2`);
    write(deps, "a.txt", "x\n");
    await play(deps, step("ide/stop-tab-b.json"));
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "AI", runId: `${second}.1`, text: "x\n" }]);
  });
});

describe("a window left open for more than 12 hours (Req 3.23)", () => {
  it("is swept at the next event, so a change after it is HUM and a late agentStop has no window", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    write(deps, "a.txt", "late\n");
    await play(deps, manual, 12 * HOUR_MS + 1000);
    expect(logLines(deps)).toEqual(["manual - window_left_open"]);
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "HUM", runId: null, text: "late\n" }]);
    expect((await stateOf(deps)).sessions[A]).toBeUndefined();
    await play(deps, step("ide/stop.json"));
    expect(logLines(deps)).toEqual(["manual - window_left_open", "agentStop - no_open_window"]);
  });

  it("drops an idle session entry with no window without a line (Req 16.22 g)", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    await play(deps, step("ide/stop.json"));
    expect((await entryOf(deps, A)).windows).toEqual([]);
    await play(deps, manual, 13 * HOUR_MS);
    expect((await stateOf(deps)).sessions[A]).toBeUndefined();
    expect(logLines(deps)).toEqual([]);
  });
});

describe("manual (Req 3.2, 16.13)", () => {
  it("with open windows writes AI of the most recently opened innermost window and closes nothing", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    await play(deps, step("cli/user-prompt-submit.json"));
    const cli = (await windowRuns(deps, F))[0] ?? "";
    write(deps, "a.txt", "x\n");
    await play(deps, manual);
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "AI", runId: `${cli}.1`, text: "x\n" }]);
    expect((await windowRuns(deps, A)).length + (await windowRuns(deps, F)).length).toBe(2);
  });

  it("with no open window writes HUM", async () => {
    const deps = workspace();
    write(deps, "a.txt", "x\n");
    await play(deps, manual);
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "HUM", runId: null, text: "x\n" }]);
  });
});

describe("promptSubmit into a session that still has a window (Req 3.8)", () => {
  it("closes the leftover window, logs window_left_open and opens one new turn", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    const first = (await windowRuns(deps, A))[0];
    await play(deps, step("ide/user-prompt-submit.json"));
    expect(logLines(deps)).toEqual(["promptSubmit - window_left_open"]);
    const now = await windowRuns(deps, A);
    expect(now).toHaveLength(1);
    expect(now[0]).not.toBe(first);
  });
});

describe("run labels from task_name and spec_name (Req 3.13, 3.14, 3.19)", () => {
  it("gives the label task when the payload has no task_name, and does not read a task field", async () => {
    const deps = workspace();
    await play(deps, synthetic("preTask", C));
    await play(deps, synthetic("preTask", "sess-D", { task: "9.9 Not read" }));
    for (const key of [C, "sess-D"]) {
      expect((await entryOf(deps, key)).windows[0]).toMatchObject({
        label: "task",
        taskNumber: null,
      });
    }
    expect((await windowRuns(deps, C))[0]?.startsWith("task ")).toBe(true);
  });

  it("cuts a task_name of 120 characters to 80", async () => {
    const deps = workspace();
    await play(deps, synthetic("preTask", C, { task_name: "a".repeat(120) }));
    expect((await entryOf(deps, C)).windows[0]?.label).toBe("a".repeat(80));
  });

  it("splits `5.3 Build the view` into Task_Number and title in the Window_Run and the Run_Id", async () => {
    const deps = workspace();
    await play(deps, synthetic("preTask", C, { task_name: "5.3 Build the view" }));
    const win = (await entryOf(deps, C)).windows[0];
    expect(win).toMatchObject({ taskNumber: "5.3", label: "Build the view" });
    expect(win?.windowRun).toMatch(/^5\.3 Build the view \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u);
    write(deps, "a.txt", "x\n");
    await play(deps, synthetic("postTask", C, { task_name: "5.3 Build the view" }));
    expect(pieces(deps, "a.txt")[0]?.runId).toBe(`${win?.windowRun ?? ""}.1`);
  });

  it("stores spec_name as a directory name and no absolute path anywhere", async () => {
    const deps = workspace();
    await play(deps, synthetic("preTask", C, { spec_name: "/home/u/.kiro/specs/sp/tasks.md" }));
    write(deps, "a.txt", "x\n");
    await play(deps, synthetic("postTask", C, { spec_name: "/home/u/.kiro/specs/sp/tasks.md" }));
    expect((await stateOf(deps)).sessions[C]?.windows).toEqual([]);
    await play(deps, synthetic("preTask", C, { spec_name: "/home/u/.kiro/specs/sp/tasks.md" }));
    expect((await entryOf(deps, C)).windows[0]?.spec).toBe("sp");
    for (const [path, entry] of deps.fs.files) {
      if (!path.startsWith(PROV)) continue;
      const text = new TextDecoder().decode(entry.bytes);
      expect(text).not.toContain("/home/u");
      expect(text).not.toContain(`${ROOT}/`);
    }
  });
});
