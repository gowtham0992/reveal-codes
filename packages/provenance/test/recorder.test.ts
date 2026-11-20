import { parseRecord } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { encodeBaseline } from "../src/core/baseline-codec.js";
import { STDIN_WAIT_MS } from "../src/core/limits.js";
import { runRecord } from "../src/io/recorder.js";
import { createStore } from "../src/io/store.js";
import { closedStdin, memoryDeps } from "./support/memory-deps.js";
import type { MemoryDeps } from "./support/memory-deps.js";
const ROOT = "/ws";
const PROV = `${ROOT}/.kiro/provenance`;
const SESSION = "sess-SECRET-7";
type Sent = Record<string, unknown>;
function workspace(): MemoryDeps {
  const deps = memoryDeps();
  const base = { version: 1 as const, at: "2025-12-31T00:00:00Z", files: {} };
  deps.fs.put(`${PROV}/baseline.json`, encodeBaseline(base));
  return deps;
}
/** Runs one event with `payload` on standard input; every call moves the clock on by one second. */
async function send(deps: MemoryDeps, event: string, payload: Sent = {}): Promise<void> {
  deps.clock.advance(1000);
  const body = JSON.stringify({ session_id: SESSION, cwd: ROOT, ...payload });
  await runRecord(withPatientStdin(deps, body), event, ROOT);
}
/** The memory clock's instant timers would end the stdin wait at once; the stdin timer never fires. */
function withPatientStdin(deps: MemoryDeps, body: string): MemoryDeps {
  const timer = (ms: number) =>
    ms === STDIN_WAIT_MS
      ? { done: new Promise<void>(() => undefined), cancel: () => undefined }
      : deps.clock.timer(ms);
  return { ...deps, clock: { ...deps.clock, timer }, stdin: closedStdin(body) };
}
const logLines = (deps: MemoryDeps): string[] =>
  (deps.fs.text(`${PROV}/errors.log`) ?? "")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => l.split(" ").slice(1).join(" "));
async function state(deps: MemoryDeps) {
  const read = await createStore(deps, PROV).readState();
  if (!read.ok || read.value === null) throw new Error("no state");
  return read.value;
}
function runIds(deps: MemoryDeps, path: string): string[] {
  const text = deps.fs.text(`${PROV}/records/${path}.reveal`);
  const parsed = text === null ? null : parseRecord(text);
  if (parsed === null || !parsed.ok) throw new Error("no record");
  return parsed.value.document.spans.map((s) => s.provenance.runId ?? "-");
}
const stackOf = async (deps: MemoryDeps): Promise<string[]> =>
  (await state(deps)).sessions[SESSION]?.windows.map((w) => w.label) ?? [];
describe("event order", () => {
  it("promptSubmit opens a turn after recording, preTask stacks, postTask pops, agentStop closes", async () => {
    const deps = workspace();
    deps.fs.put(`${ROOT}/a.txt`, "one\n");
    await send(deps, "manual");
    expect(runIds(deps, "a.txt")).toEqual(["-"]);
    deps.fs.put(`${ROOT}/a.txt`, "one\ntwo\n");
    await send(deps, "promptSubmit", { prompt: "do not read me" });
    expect((await state(deps)).sessions[SESSION]?.promptSeen).toBe(true);
    expect(await stackOf(deps)).toEqual(["turn"]);
    expect(deps.fs.text(`${PROV}/records/a.txt.reveal`)).not.toContain("do not read me");
    deps.fs.put(`${ROOT}/a.txt`, "one\ntwo\nthree\n");
    await send(deps, "preTask", { task_name: "5.3 Build the view" });
    expect(await stackOf(deps)).toEqual(["turn", "Build the view"]);
    deps.fs.put(`${ROOT}/a.txt`, "one\ntwo\nthree\nfour\n");
    await send(deps, "postTask", { task_name: "5.3 Build the view" });
    expect(await stackOf(deps)).toEqual(["turn"]);
    await send(deps, "agentStop");
    expect(await stackOf(deps)).toEqual([]);
    const ids = runIds(deps, "a.txt");
    expect(ids.filter((id) => id.includes("turn"))).toHaveLength(1);
    expect(ids.filter((id) => id.includes("5.3 Build the view"))).toHaveLength(1);
    expect(logLines(deps)).toEqual([]);
  });
  it("manual changes no window and records an Outside_Change as HUM", async () => {
    const deps = workspace();
    await send(deps, "preTask", { task_name: "1 One" });
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await send(deps, "manual");
    expect(await stackOf(deps)).toEqual(["One"]);
    expect(runIds(deps, "a.txt")[0]).toContain("1 One");
  });
});
describe("names carry no Session_Key and no path", () => {
  it("keeps the session id, cwd and path out of Window_Runs, Run_Ids, Records and the log", async () => {
    const deps = workspace();
    await send(deps, "promptSubmit");
    deps.fs.put(`${ROOT}/src/a.txt`, "x\n");
    await send(deps, "agentStop", { spec_name: "/home/u/.kiro/specs/sp/tasks.md" });
    const everything = [
      deps.fs.text(`${PROV}/records/src/a.txt.reveal`) ?? "",
      deps.fs.text(`${PROV}/errors.log`) ?? "",
      deps.fs.text(`${PROV}/baseline.json`) ?? "",
      deps.fs.text(`${PROV}/sessions.json`) ?? "",
    ].join("\n");
    expect(everything).not.toContain(SESSION);
    expect(everything).not.toContain("/home/u");
    expect(everything).not.toContain(ROOT);
    const win = (await state(deps)).lastWindowRun ?? "";
    expect(win).not.toContain(SESSION);
    expect(win.startsWith("turn ")).toBe(true);
  });
});
describe("write order", () => {
  it("writes state.json last, after sessions.json and the Records", async () => {
    const deps = workspace();
    const renamed: string[] = [];
    deps.fs.failWhen((op, path) => {
      if (op === "rename") renamed.push(path.replace(/\.tmp-.*$/u, ""));
      return null;
    });
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await send(deps, "agentStop");
    expect(renamed.at(-1)).toBe(`${PROV}/state.json`);
    const sessions = renamed.indexOf(`${PROV}/sessions.json`);
    expect(sessions).toBeGreaterThan(renamed.indexOf(`${PROV}/records/a.txt.reveal`));
    expect(sessions).toBeLessThan(renamed.lastIndexOf(`${PROV}/state.json`));
  });
});
describe("deadline", () => {
  it("logs deadline_reached:<n> and leaves the files not reached untouched", async () => {
    const deps = workspace();
    for (const name of ["a", "b", "c"]) deps.fs.put(`${ROOT}/${name}.txt`, `${name}\n`);
    deps.fs.failWhen((op, path) => {
      if (op === "read" && path === `${ROOT}/a.txt`) deps.clock.advance(21_000);
      return null;
    });
    await send(deps, "manual");
    expect(logLines(deps)).toEqual(["manual - deadline_reached:2"]);
    expect(deps.fs.text(`${PROV}/records/a.txt.reveal`)).not.toBeNull();
    expect(deps.fs.text(`${PROV}/records/b.txt.reveal`)).toBeNull();
    expect(deps.fs.text(`${PROV}/records/c.txt.reveal`)).toBeNull();
  });
});
describe("lock, unknown event, no Record_Directory", () => {
  it("gives up with lock_timeout and changes nothing", async () => {
    const deps = workspace();
    deps.fs.put(`${PROV}/lock`, "1 now\n", deps.clock.nowMs());
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await send(deps, "agentStop");
    expect(logLines(deps)).toEqual(["agentStop - lock_timeout"]);
    expect(deps.fs.text(`${PROV}/state.json`)).toBeNull();
    expect(deps.fs.text(`${PROV}/records/a.txt.reveal`)).toBeNull();
    expect(deps.fs.text(`${PROV}/lock`)).toBe("1 now\n");
  });
  it("logs unknown_event and does nothing else", async () => {
    const deps = workspace();
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await send(deps, "bogus");
    expect(logLines(deps)).toEqual(["unknown - unknown_event"]);
    expect(deps.fs.text(`${PROV}/state.json`)).toBeNull();
  });
  it("finishes without a log or a write when no Record_Directory is found", async () => {
    const deps = memoryDeps();
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    const before = [...deps.fs.files.keys()];
    await send(deps, "agentStop", { cwd: "relative/dir" });
    expect([...deps.fs.files.keys()]).toEqual(before);
    expect(deps.faults).toEqual([]);
  });
  it("finds the Record_Directory from an absolute payload cwd", async () => {
    const deps = workspace();
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await runRecord(
      withPatientStdin(deps, JSON.stringify({ cwd: ROOT })),
      "agentStop",
      "/elsewhere",
    );
    expect(deps.fs.text(`${PROV}/state.json`)).not.toBeNull();
  });
});
describe("sessions.json", () => {
  it("is written at the counting agentStop only, and never twice for one session", async () => {
    const deps = workspace();
    await send(deps, "preTask", { task_name: "1 One" });
    await send(deps, "postTask", { task_name: "1 One" });
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBeNull();
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await send(deps, "agentStop");
    expect(deps.fs.text(`${PROV}/sessions.json`)).toContain('"noPromptEventSessions": 1');
    expect(logLines(deps)).toEqual(["agentStop - no_prompt_events"]);
    const bytes = deps.fs.text(`${PROV}/sessions.json`);
    deps.fs.put(`${ROOT}/a.txt`, "xy\n");
    await send(deps, "agentStop");
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBe(bytes);
    expect(logLines(deps)).toEqual(["agentStop - no_prompt_events", "agentStop - no_open_window"]);
  });
  it("logs bad_sessions, counts nothing and leaves the file and the flag alone", async () => {
    const deps = workspace();
    deps.fs.put(`${PROV}/sessions.json`, "not json");
    await send(deps, "preTask", { task_name: "1 One" });
    await send(deps, "postTask", { task_name: "1 One" });
    deps.fs.put(`${ROOT}/a.txt`, "x\n");
    await send(deps, "agentStop");
    expect(deps.fs.text(`${PROV}/sessions.json`)).toBe("not json");
    expect(logLines(deps)).toContain("agentStop - bad_sessions");
    expect(logLines(deps)).not.toContain("agentStop - no_prompt_events");
    expect((await state(deps)).sessions[SESSION]?.noPromptCounted).toBe(false);
  });
});
