import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePayload } from "../src/core/payload.js";
import type { HookEvent, Payload, ProvenanceError, WindowState } from "../src/core/types.js";
import {
  NONE_KEY,
  closeLeftover,
  select,
  sessionKey,
  sweepStale,
  transition,
} from "../src/core/windows.js";
import { CLOCK_START_MS, fixedClock } from "./support/clock.js";

const HOUR = 3_600_000;
const EMPTY: WindowState = {
  version: 1,
  order: 0,
  lastWindowRun: null,
  lastEventAt: null,
  recordedAtMs: 0,
  noSessionIdLogged: false,
  sessions: {},
  files: {},
  skipped: {},
};

function payload(sessionId: string | null, taskName: string | null = null): Payload {
  return { sessionId, cwd: null, taskName, specName: null, taskSuccess: null };
}

type Step = {
  state: WindowState;
  faults: ProvenanceError[];
  countSession: boolean;
  selected: string | null;
};

/** One event in the Recorder's order: sweep, leftover, select, transition. */
function run(
  state: WindowState,
  event: HookEvent,
  p: Payload,
  atMs: number,
  outsideFound = false,
): Step {
  const key = event === "manual" ? null : sessionKey(p);
  const swept = sweepStale(state, atMs);
  const left = event === "promptSubmit" && key !== null ? closeLeftover(swept.state, key) : swept;
  const sel = select(left.state, key);
  const t = transition(left.state, event, key, p, fixedClock(atMs), outsideFound);
  return {
    state: t.state,
    faults: [...swept.faults, ...(left === swept ? [] : left.faults), ...t.faults],
    countSession: t.countSession,
    selected: sel === null ? null : sel.windowRun,
  };
}

const kinds = (s: Step): string[] => s.faults.map((f) => f.kind);
const T = CLOCK_START_MS;

describe("windows: rule 21 and the overlap scenario (Req 3.21, 16.19)", () => {
  it("IDE and CLI overlap: each stop attributes to the most recent or own window", () => {
    let s = run(EMPTY, "promptSubmit", payload("ide"), T).state;
    s = run(s, "promptSubmit", payload("cli"), T + 1000).state;
    const ideWin = s.sessions["ide"]?.windows[0]?.windowRun ?? "";
    const cliWin = s.sessions["cli"]?.windows[0]?.windowRun ?? "";
    const first = run(s, "agentStop", payload("ide"), T + 2000);
    expect(first.selected).toBe(ideWin);
    expect(first.state.sessions["cli"]?.windows.map((w) => w.windowRun)).toEqual([cliWin]);
    const second = run(first.state, "agentStop", payload("cli"), T + 3000);
    expect(second.selected).toBe(cliWin);
    expect(run(second.state, "manual", payload(null), T + 4000).selected).toBeNull();
  });

  it("two other sessions opened in the same second: the higher order wins", () => {
    let s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    s = run(s, "promptSubmit", payload("b"), T).state;
    const b = s.sessions["b"]?.windows[0];
    expect(b?.order).toBe(2);
    expect(select(s, "c")).toEqual(b);
    expect(select(s, null)).toEqual(b);
  });

  it("a session's own window beats a more recent window of another session", () => {
    let s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    s = run(s, "promptSubmit", payload("b"), T).state;
    expect(select(s, "a")?.order).toBe(1);
  });

  it("manual selects nothing with no window and the latest innermost over all sessions", () => {
    expect(run(EMPTY, "manual", payload(null), T).selected).toBeNull();
    let s = run(EMPTY, "preTask", payload("a", "1 One"), T).state;
    s = run(s, "preTask", payload("b", "2 Two"), T + 1000).state;
    const m = run(s, "manual", payload(null), T + 2000);
    expect(m.selected).toBe("2 Two 2026-01-01T00:00:01Z");
    expect(m.state).toEqual(s);
    expect(m.faults).toEqual([]);
  });
});

describe("windows: transitions (Req 3.2 to 3.7, 3.24)", () => {
  it("promptSubmit into a left-open window closes it, logs, and opens a new turn", () => {
    const s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    const r = run(s, "promptSubmit", payload("a"), T + 5000);
    expect(kinds(r)).toEqual(["window_left_open"]);
    expect(r.selected).toBeNull();
    expect(r.state.sessions["a"]?.windows.map((w) => w.windowRun)).toEqual([
      "turn 2026-01-01T00:00:05Z",
    ]);
  });

  it("leftover closes only its own session", () => {
    let s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    s = run(s, "promptSubmit", payload("b"), T).state;
    const r = closeLeftover(s, "a");
    expect(r.state.sessions["a"]?.windows).toEqual([]);
    expect(r.state.sessions["b"]).toEqual(s.sessions["b"]);
  });

  it("agentStop and postTask with no window log no_open_window", () => {
    expect(kinds(run(EMPTY, "agentStop", payload("a"), T))).toEqual(["no_open_window"]);
    expect(kinds(run(EMPTY, "postTask", payload("a"), T))).toEqual(["no_open_window"]);
  });

  it("nested preTask above a turn: postTask leaves the turn, a later agentStop is quiet", () => {
    let s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    s = run(s, "preTask", payload("a", "5.3 Build the view"), T + 1000).state;
    expect(s.sessions["a"]?.windows.map((w) => [w.kind, w.taskNumber, w.label])).toEqual([
      ["turn", null, "turn"],
      ["task", "5.3", "Build the view"],
    ]);
    const post = run(s, "postTask", payload("a"), T + 2000);
    expect(post.selected).toBe("5.3 Build the view 2026-01-01T00:00:01Z");
    expect(post.state.sessions["a"]?.windows.map((w) => w.kind)).toEqual(["turn"]);
    expect(post.state.sessions["a"]?.lastClosedBy).toBeNull();
    const stop = run(post.state, "agentStop", payload("a"), T + 3000);
    expect(stop.faults).toEqual([]);
    expect(stop.state.sessions["a"]?.windows).toEqual([]);
  });

  it("opening resets lastClosedBy, counts order, and names collide with ~2", () => {
    let s = run(EMPTY, "preTask", payload("a", "Same"), T).state;
    s = run(s, "preTask", payload("a", "Same"), T).state;
    expect(s.order).toBe(2);
    expect(s.sessions["a"]?.windows.map((w) => w.windowRun)).toEqual([
      "Same 2026-01-01T00:00:00Z",
      "Same 2026-01-01T00:00:00Z~2",
    ]);
  });

  it("the event changes only its own session and records its lastEventAt", () => {
    const s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    const r = run(s, "promptSubmit", payload("b"), T + 1000).state;
    expect(r.sessions["a"]).toEqual(s.sessions["a"]);
    expect(r.sessions["b"]?.lastEventAt).toBe(new Date(T + 1000).toISOString());
    expect(r.sessions["b"]).toMatchObject({ promptSeen: true, noPromptCounted: false });
  });

  it("spec directory names are kept on task windows only", () => {
    const p: Payload = { ...payload("a", "1 T"), specName: "my-spec" };
    expect(run(EMPTY, "preTask", p, T).state.sessions["a"]?.windows[0]?.spec).toBe("my-spec");
    expect(run(EMPTY, "promptSubmit", p, T).state.sessions["a"]?.windows[0]?.spec).toBeUndefined();
  });
});

describe("windows: the _none key (Req 3.22)", () => {
  it("maps a missing and an empty session_id to _none and logs once per state", () => {
    expect(sessionKey(payload(null))).toBe(NONE_KEY);
    expect(sessionKey(payload(""))).toBe(NONE_KEY);
    const a = run(EMPTY, "promptSubmit", payload(null), T);
    expect(kinds(a)).toEqual(["no_session_id"]);
    expect(a.state.noSessionIdLogged).toBe(true);
    const b = run(a.state, "agentStop", payload(""), T + 1000);
    expect(b.faults).toEqual([]);
    expect(b.selected).toBe("turn 2026-01-01T00:00:00Z");
    expect(Object.keys(b.state.sessions)).toEqual([NONE_KEY]);
    expect(kinds(run(EMPTY, "promptSubmit", payload(null), T + 2000))).toEqual(["no_session_id"]);
  });

  it("no Session_Key reaches a Window_Run or label", () => {
    const s = run(EMPTY, "preTask", payload("secret-session-1", "1 Task"), T).state;
    const win = s.sessions["secret-session-1"]?.windows[0];
    expect(JSON.stringify([win?.windowRun, win?.label])).not.toContain("secret-session");
  });
});

describe("windows: the 12-hour sweep (Req 3.23)", () => {
  it("sweeps a window left open for 13 hours; a late agentStop logs no_open_window", () => {
    const s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    const r = run(s, "agentStop", payload("a"), T + 13 * HOUR);
    expect(kinds(r)).toEqual(["window_left_open", "no_open_window"]);
    expect(r.selected).toBeNull();
  });

  it("a gap of exactly 12 hours is not swept; one millisecond more is", () => {
    const s = run(EMPTY, "promptSubmit", payload("a"), T).state;
    expect(sweepStale(s, T + 12 * HOUR)).toEqual({ state: s, faults: [] });
    expect(sweepStale(s, T + 12 * HOUR + 1).faults).toHaveLength(1);
  });

  it("drops an idle empty entry without a fault, and one fault per window otherwise", () => {
    let s = run(EMPTY, "preTask", payload("a", "1 A"), T).state;
    s = run(s, "preTask", payload("a", "2 B"), T).state;
    s = run(s, "agentStop", payload("idle"), T).state;
    const r = sweepStale(s, T + 13 * HOUR);
    expect(r.faults).toHaveLength(2);
    expect(r.state.sessions).toEqual({});
  });

  it("keeps a recent session while sweeping a stale one", () => {
    let s = run(EMPTY, "promptSubmit", payload("old"), T).state;
    s = run(s, "promptSubmit", payload("new"), T + 10 * HOUR).state;
    const r = sweepStale(s, T + 13 * HOUR);
    expect(Object.keys(r.state.sessions)).toEqual(["new"]);
  });
});

describe("windows: no_prompt_events (Req 3.26, Decision 20)", () => {
  function specsPanel(outside: boolean): Step[] {
    const steps: Step[] = [];
    let s = EMPTY;
    const seq: [HookEvent, Payload][] = [
      ["preTask", payload("C", "2. Probe task two")],
      ["postTask", payload("C", "2. Probe task two")],
      ["agentStop", payload("C")],
      ["agentStop", payload("C")],
    ];
    seq.forEach(([event, p], i) => {
      const r = run(s, event, p, T + i * 1000, event === "agentStop" && outside);
      steps.push(r);
      s = r.state;
    });
    return steps;
  }

  it("Specs-panel sequence, nothing outside: no fault, postTask then agentStop, no count", () => {
    const [pre, post, stop, again] = specsPanel(false);
    expect(pre?.faults).toEqual([]);
    expect(post?.state.sessions["C"]?.lastClosedBy).toBe("postTask");
    expect(stop?.faults).toEqual([]);
    expect(stop?.state.sessions["C"]?.lastClosedBy).toBe("agentStop");
    expect(stop?.countSession).toBe(false);
    expect(kinds(again as Step)).toEqual(["no_open_window"]);
  });

  it("Specs-panel sequence with an outside change: one fault, one count, never a second", () => {
    const [, , stop, again] = specsPanel(true);
    expect(kinds(stop as Step)).toEqual(["no_prompt_events"]);
    expect(stop?.countSession).toBe(true);
    expect(stop?.state.sessions["C"]?.noPromptCounted).toBe(true);
    expect(kinds(again as Step)).toEqual(["no_open_window"]);
    expect(again?.countSession).toBe(false);
  });

  it("an orchestrator-like agentStop with no entry logs both faults and counts once", () => {
    const r = run(EMPTY, "agentStop", payload("D"), T, true);
    expect(kinds(r)).toEqual(["no_open_window", "no_prompt_events"]);
    expect(r.countSession).toBe(true);
  });

  it("a session with promptSeen is never counted", () => {
    const s = run(EMPTY, "promptSubmit", payload("E"), T).state;
    const r = run(s, "agentStop", payload("E"), T + 1000, true);
    expect(r.countSession).toBe(false);
    expect(kinds(r)).toEqual([]);
  });

  it("only agentStop counts", () => {
    expect(run(EMPTY, "postTask", payload("F"), T, true).countSession).toBe(false);
  });
});

describe("windows: captured fixture sequences", () => {
  type Fixture = { events: { payload: Record<string, unknown> }[] };
  const load = (name: string): Fixture =>
    JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as Fixture;
  const eventOf = (name: unknown): HookEvent | null =>
    name === "PreTaskExec"
      ? "preTask"
      : name === "PostTaskExec"
        ? "postTask"
        : name === "Stop"
          ? "agentStop"
          : name === "UserPromptSubmit"
            ? "promptSubmit"
            : null;

  function play(name: string, outsideAtStop: boolean): string[][] {
    let s = EMPTY;
    const out: string[][] = [];
    load(name).events.forEach((e, i) => {
      const event = eventOf(e.payload["hook_event_name"]);
      if (event === null) return;
      const r = run(s, event, parsePayload(JSON.stringify(e.payload)), T + i * 1000, outsideAtStop);
      s = r.state;
      out.push(kinds(r));
    });
    return out;
  }

  it("specs-panel-session: no fault until a Stop with an outside change", () => {
    expect(play("ide/specs-panel-session.json", false)).toEqual([[], [], []]);
    expect(play("ide/specs-panel-session.json", true)).toEqual([[], [], ["no_prompt_events"]]);
  });

  it("orchestrator-session: the first Stop logs both, the second task Stop is quiet", () => {
    const out = play("ide/orchestrator-session.json", true);
    expect(out[0]).toEqual(["no_open_window", "no_prompt_events"]);
    expect(out[1]).toEqual([]);
    expect(out[2]).toEqual([]);
    expect(out[3]).toEqual([]);
  });

  it("CLI turn: prompt then stop in one session leaves an empty kept entry", () => {
    const a = run(EMPTY, "promptSubmit", payload("cli"), T);
    const b = run(a.state, "agentStop", payload("cli"), T + 1000, true);
    expect(b.faults).toEqual([]);
    expect(b.state.sessions["cli"]).toMatchObject({ windows: [], lastClosedBy: "agentStop" });
  });
});
