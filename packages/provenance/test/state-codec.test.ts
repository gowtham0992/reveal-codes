import { describe, expect, it } from "vitest";
import {
  decodeSessions,
  decodeState,
  encodeSessions,
  encodeState,
} from "../src/core/state-codec.js";
import type { ClosedBy, OpenWindow, SessionState, WindowState } from "../src/core/types.js";

const D = "d".repeat(64);
const T0 = "2026-11-19T10:00:00Z";
const T1 = "2026-11-19T10:05:00Z";

const turn: OpenWindow = {
  windowRun: `turn ${T0}`,
  label: "turn",
  taskNumber: null,
  kind: "turn",
  openedAt: T0,
  order: 16,
};
const task: OpenWindow = {
  windowRun: "1 Probe task one 2026-11-19T10:01:00Z",
  label: "Probe task one",
  taskNumber: "1",
  kind: "task",
  openedAt: "2026-11-19T10:01:00Z",
  order: 17,
  spec: "probe-scratch",
};

function session(over: Partial<SessionState> = {}): SessionState {
  return {
    lastEventAt: T1,
    lastClosedBy: null,
    promptSeen: true,
    noPromptCounted: false,
    windows: [turn, task],
    ...over,
  };
}

function state(over: Partial<WindowState> = {}): WindowState {
  return {
    version: 1,
    order: 17,
    lastWindowRun: turn.windowRun,
    lastEventAt: T1,
    recordedAtMs: 1794981816799,
    noSessionIdLogged: false,
    sessions: { "s-1": session() },
    files: {
      "src/a.ts": { size: 1200, mtimeMs: 1794981000000.5, digest: D, seenMs: 1794981010000 },
    },
    skipped: { "data/big.json": { size: 412000, mtimeMs: 1794981000000, reason: "over_limit" } },
    ...over,
  };
}

function roundTrip(s: WindowState): WindowState {
  const r = decodeState(encodeState(s));
  if (!r.ok) throw new Error(`decode failed: ${r.error.detail ?? r.error.kind}`);
  return r.value;
}

describe("lastHookEventAt (Req 3.29)", () => {
  it("round-trips when present and is left out of the text when absent", () => {
    const s = state({ lastHookEventAt: T1 });
    expect(roundTrip(s)).toEqual(s);
    expect(encodeState(s)).toContain(`"lastHookEventAt": "${T1}"`);
    expect(encodeState(state())).not.toContain("lastHookEventAt");
  });
  it("reads a state.json without it as a state without it", () => {
    const back = roundTrip(state());
    expect(back).not.toHaveProperty("lastHookEventAt");
  });
  it("refuses a value that is not a time stamp", () => {
    const edit = (value: unknown): string =>
      withEdit((o) => {
        o["lastHookEventAt"] = value;
      });
    expect(decodeState(edit("yesterday")).ok).toBe(false);
    expect(decodeState(edit(5)).ok).toBe(false);
    expect(decodeState(edit(null)).ok).toBe(false);
  });
});
describe("decodeState(encodeState(s))", () => {
  it("round-trips the design's document", () => {
    expect(roundTrip(state())).toEqual(state());
  });

  it("round-trips two sessions with nested windows, and the spec directory name", () => {
    const s = state({ sessions: { b: session({ windows: [turn] }), a: session() } });
    const back = roundTrip(s);
    expect(back).toEqual(s);
    expect(back.sessions["a"]?.windows[1]?.spec).toBe("probe-scratch");
    expect(back.sessions["b"]?.windows[0]).not.toHaveProperty("spec");
  });

  it("keeps the raw taskName on a window, and a state without it still decodes", () => {
    const named = { ...task, taskName: "1. Probe task one" };
    const s = state({ sessions: { x: session({ windows: [turn, named] }) } });
    const back = roundTrip(s);
    expect(back).toEqual(s);
    expect(back.sessions["x"]?.windows[0]).not.toHaveProperty("taskName");
    expect(decodeState(encodeState(state())).ok).toBe(true);
    expect(
      decodeState(withEdit((o) => (firstSession(o)["windows"] = [{ ...turn, taskName: 5 }]))).ok,
    ).toBe(false);
  });
  it("keeps a window with a Task_Number and one with none", () => {
    const back = roundTrip(state());
    expect(back.sessions["s-1"]?.windows.map((w) => w.taskNumber)).toEqual([null, "1"]);
  });

  it.each([true, false])("keeps noSessionIdLogged %s", (flag) => {
    expect(roundTrip(state({ noSessionIdLogged: flag })).noSessionIdLogged).toBe(flag);
  });

  it("keeps a session with an empty stack closed by postTask", () => {
    const s = state({ sessions: { x: session({ windows: [], lastClosedBy: "postTask" }) } });
    expect(roundTrip(s).sessions["x"]).toEqual({
      ...session(),
      windows: [],
      lastClosedBy: "postTask",
    });
  });

  it.each<ClosedBy | null>([null, "postTask", "agentStop", "sweep", "leftover"])(
    "keeps lastClosedBy %s",
    (by) => {
      expect(
        roundTrip(state({ sessions: { x: session({ lastClosedBy: by }) } })).sessions["x"]
          ?.lastClosedBy,
      ).toBe(by);
    },
  );

  it.each([true, false])("keeps promptSeen and noPromptCounted %s", (flag) => {
    const back = roundTrip(
      state({ sessions: { x: session({ promptSeen: flag, noPromptCounted: !flag }) } }),
    );
    expect(back.sessions["x"]).toMatchObject({ promptSeen: flag, noPromptCounted: !flag });
  });

  it("keeps a session key that looks like a prototype key as data", () => {
    const sessions = Object.fromEntries([["__proto__", session()]]);
    const back = roundTrip(state({ sessions }));
    expect(Object.keys(back.sessions)).toEqual(["__proto__"]);
  });

  it("writes the same bytes for any insertion order of keys", () => {
    const a = state({ sessions: { a: session(), b: session() } });
    const b = state({ sessions: { b: session(), a: session() } });
    expect(encodeState(a)).toBe(encodeState(b));
    expect(encodeState(a).endsWith("}\n")).toBe(true);
  });

  it("holds the Session_Key only in state.json", () => {
    expect(encodeState(state())).toContain('"s-1"');
    expect(encodeSessions(3)).not.toContain("s-1");
  });
});

function withEdit(edit: (o: Record<string, unknown>) => void): string {
  const o = JSON.parse(encodeState(state())) as Record<string, unknown>;
  edit(o);
  return JSON.stringify(o);
}

function firstSession(o: Record<string, unknown>): Record<string, unknown> {
  return (o["sessions"] as Record<string, Record<string, unknown>>)["s-1"] as Record<
    string,
    unknown
  >;
}

describe("decodeState errors", () => {
  it("rejects a wrong version", () => {
    expect(decodeState(withEdit((o) => (o["version"] = 2))).ok).toBe(false);
  });

  it("rejects a window stack that is not an array", () => {
    expect(decodeState(withEdit((o) => (firstSession(o)["windows"] = {}))).ok).toBe(false);
  });

  it("rejects a non-string digest", () => {
    const text = withEdit((o) => {
      const files = o["files"] as Record<string, Record<string, unknown>>;
      (files["src/a.ts"] as Record<string, unknown>)["digest"] = 5;
    });
    expect(decodeState(text).ok).toBe(false);
  });

  it("rejects non-JSON", () => {
    expect(decodeState("{nope").ok).toBe(false);
  });

  it.each(["lastClosedBy", "promptSeen", "noPromptCounted"])(
    "rejects a session entry without %s",
    (key) => {
      const text = withEdit((o) => (firstSession(o)[key] = undefined));
      const r = decodeState(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("bad_state");
    },
  );

  it("rejects an unknown closer and an unknown key", () => {
    expect(decodeState(withEdit((o) => (firstSession(o)["lastClosedBy"] = "x"))).ok).toBe(false);
    expect(decodeState(withEdit((o) => (o["extra"] = 1))).ok).toBe(false);
  });
});

describe("sessions.json", () => {
  it("writes the exact bytes for 0 and 12", () => {
    expect(encodeSessions(0)).toBe('{ "version": 1, "noPromptEventSessions": 0 }\n');
    expect(encodeSessions(12)).toBe('{ "version": 1, "noPromptEventSessions": 12 }\n');
  });

  it("round-trips a count", () => {
    expect(decodeSessions(encodeSessions(12))).toEqual({ ok: true, value: 12 });
  });

  it.each([
    '{ "version": 1, "noPromptEventSessions": -1 }',
    '{ "version": 1, "noPromptEventSessions": 1.5 }',
    '{ "version": 1 }',
    '{ "version": 1, "noPromptEventSessions": 1, "x": 2 }',
    '{ "version": 2, "noPromptEventSessions": 1 }',
    "not json",
  ])("rejects %s", (text) => {
    const r = decodeSessions(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("bad_sessions");
  });
});
