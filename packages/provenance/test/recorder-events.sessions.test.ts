import { describe, expect, it } from "vitest";
import {
  PROV,
  entryOf,
  fixture,
  logLines,
  pieces,
  play,
  sessionCount,
  step,
  synthetic,
  windowRuns,
  workspace,
  write,
} from "./support/event-harness.js";

const C = "sess-C";
const SPECS = "ide/specs-panel-session.json";
const ORCHESTRATOR = "ide/orchestrator-session.json";

describe("sessions without prompt events (Req 16.22)", () => {
  it("(a) a Specs-panel task with no change after postTask writes no line and counts nothing", async () => {
    const deps = workspace();
    const [pre, post, stop] = fixture(SPECS);
    if (pre === undefined || post === undefined || stop === undefined) throw new Error("fixture");
    expect([pre.event, post.event, stop.event]).toEqual(["preTask", "postTask", "agentStop"]);
    await play(deps, pre);
    write(deps, "a.txt", "task\n");
    await play(deps, post);
    expect((await entryOf(deps, C)).lastClosedBy).toBe("postTask");
    await play(deps, stop);
    expect((await entryOf(deps, C)).lastClosedBy).toBe("agentStop");
    expect(pieces(deps, "a.txt").map((p) => p.origin)).toEqual(["AI"]);
    expect(logLines(deps)).toEqual([]);
    expect(await sessionCount(deps)).toBe(0);
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBeNull();
  });

  it("(b) a change after postTask is HUM at agentStop, with one no_prompt_events and the count 1", async () => {
    const deps = workspace();
    for (const s of fixture(SPECS).slice(0, 2)) await play(deps, s);
    write(deps, "a.txt", "after\n");
    await play(deps, step(SPECS, 2));
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "HUM", runId: null, text: "after\n" }]);
    expect(logLines(deps)).toEqual(["agentStop - no_prompt_events"]);
    expect(await sessionCount(deps)).toBe(1);
    expect((await entryOf(deps, C)).noPromptCounted).toBe(true);
  });

  it("(c) an orchestrator Stop with a change and no window counts once; a second adds only no_open_window", async () => {
    const deps = workspace();
    const stop = step(ORCHESTRATOR, 0);
    write(deps, "a.txt", "one\n");
    await play(deps, stop);
    expect(logLines(deps)).toEqual(["agentStop - no_open_window", "agentStop - no_prompt_events"]);
    expect(await sessionCount(deps)).toBe(1);
    const bytes = deps.fs.text(`${PROV}/sessions.json`);
    write(deps, "a.txt", "one\ntwo\n");
    await play(deps, stop);
    expect(logLines(deps).slice(2)).toEqual(["agentStop - no_open_window"]);
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBe(bytes);
    for (const s of fixture(ORCHESTRATOR).slice(1)) await play(deps, s);
    expect(logLines(deps)).toHaveLength(3);
    expect(await sessionCount(deps)).toBe(1);
  });

  it("(d) a CLI turn with no task events is AI of the turn window and counts nothing", async () => {
    const deps = workspace();
    const [prompt, stop] = fixture("cli/turn-without-task-events.json");
    if (prompt === undefined || stop === undefined) throw new Error("fixture");
    await play(deps, prompt);
    const win = (await windowRuns(deps, "sess-F"))[0] ?? "";
    write(deps, "a.txt", "turn\n");
    await play(deps, stop);
    expect(pieces(deps, "a.txt")).toEqual([{ origin: "AI", runId: `${win}.1`, text: "turn\n" }]);
    expect(win.startsWith("turn ")).toBe(true);
    const entry = await entryOf(deps, "sess-F");
    expect(entry.promptSeen).toBe(true);
    expect(entry.noPromptCounted).toBe(false);
    expect(logLines(deps)).toEqual([]);
    expect(await sessionCount(deps)).toBe(0);
  });

  it("(e) a postTask that leaves an outer turn open and a later agentStop write no line", async () => {
    const deps = workspace();
    await play(deps, synthetic("promptSubmit", C));
    await play(deps, step(SPECS, 0));
    await play(deps, step(SPECS, 1));
    expect((await entryOf(deps, C)).windows.map((w) => w.kind)).toEqual(["turn"]);
    await play(deps, step(SPECS, 2));
    expect(logLines(deps)).toEqual([]);
  });

  it("(f) two agentStop in a row after a postTask write nothing, then no_open_window", async () => {
    const deps = workspace();
    for (const s of fixture(SPECS).slice(0, 3)) await play(deps, s);
    expect(logLines(deps)).toEqual([]);
    await play(deps, step(SPECS, 2));
    expect(logLines(deps)).toEqual(["agentStop - no_open_window"]);
  });
});

describe("sessions.json (Req 16.22 h)", () => {
  it("is read as 0 when absent and is not created by events that count nothing", async () => {
    const deps = workspace();
    await play(deps, step("ide/user-prompt-submit.json"));
    await play(deps, step("ide/stop.json"));
    expect(await sessionCount(deps)).toBe(0);
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBeNull();
  });

  it("when it does not parse logs bad_sessions, counts nothing and leaves noPromptCounted unset", async () => {
    const deps = workspace();
    deps.fs.put(`${PROV}/sessions.json`, "{ not json");
    write(deps, "a.txt", "one\n");
    await play(deps, step(ORCHESTRATOR, 0));
    expect(logLines(deps)).toEqual(["agentStop - no_open_window", "agentStop - bad_sessions"]);
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBe("{ not json");
    expect((await entryOf(deps, "sess-D")).noPromptCounted).toBe(false);
  });

  it("is left unchanged when the counting event is repeated", async () => {
    const deps = workspace();
    write(deps, "a.txt", "one\n");
    await play(deps, step(ORCHESTRATOR, 0));
    const bytes = deps.fs.text(`${PROV}/sessions.json`);
    expect(bytes).toContain('"noPromptEventSessions": 1');
    await play(deps, step(ORCHESTRATOR, 0));
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBe(bytes);
    expect(logLines(deps).filter((l) => l.endsWith("no_prompt_events"))).toHaveLength(1);
  });
});
