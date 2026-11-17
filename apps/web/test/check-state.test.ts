import { describe, expect, it } from "vitest";
import {
  INITIAL_CHECK_STATE,
  reduceCheck,
  type CheckAction,
  type CheckState,
} from "../src/check/check-state";
import type { CheckDone, CheckResult } from "../src/check/run-check";

// The reducer only stores a CheckDone; it never reads inside it.
const DONE = {
  kind: "done",
  checkedAt: "2026-01-01T00:00:00.000Z",
  text: "a",
} as unknown as CheckDone;

function run(actions: readonly CheckAction[], from: CheckState = INITIAL_CHECK_STATE): CheckState {
  return actions.reduce(reduceCheck, from);
}

function checked(text: string): CheckState {
  const s = run([{ type: "edit", text }, { type: "start" }]);
  return reduceCheck(s, { type: "finish", generation: s.generation, result: DONE });
}

describe("reduceCheck _Requirements: 9.1, 9.4, 9.5_", () => {
  it("edit to the same text changes nothing", () => {
    const s = run([{ type: "edit", text: "abc" }]);
    expect(reduceCheck(s, { type: "edit", text: "abc" })).toBe(s);
  });

  it("edit to different text bumps generation and is not stale without results", () => {
    const s = run([{ type: "edit", text: "abc" }]);
    expect(s.text).toBe("abc");
    expect(s.generation).toBe(1);
    expect(s.stale).toBe(false);
  });

  it("edit after a completed run marks the results stale", () => {
    const s = reduceCheck(checked("abc"), { type: "edit", text: "abcd" });
    expect(s.stale).toBe(true);
    expect(s.results).toBe(DONE);
  });

  it("stale survives restoring the checked text", () => {
    const s = run(
      [
        { type: "edit", text: "abcd" },
        { type: "edit", text: "abc" },
      ],
      checked("abc"),
    );
    expect(s.text).toBe("abc");
    expect(s.stale).toBe(true);
  });

  it("start records the generation and clears the message", () => {
    const s = run([{ type: "edit", text: "abc" }, { type: "start" }]);
    expect(s.running).toEqual({ generation: 1, waiting: false });
    const failed = reduceCheck(s, {
      type: "finish",
      generation: 1,
      result: { kind: "message", text: "no" },
    });
    expect(failed.message).toBe("no");
    expect(reduceCheck(failed, { type: "start" }).message).toBeNull();
  });

  it("waiting sets the flag only while running", () => {
    expect(reduceCheck(INITIAL_CHECK_STATE, { type: "waiting" })).toBe(INITIAL_CHECK_STATE);
    const s = run([{ type: "start" }, { type: "waiting" }]);
    expect(s.running?.waiting).toBe(true);
  });

  it("a done finish for the current generation sets results and clears stale and message", () => {
    const s0 = run([{ type: "edit", text: "abcd" }, { type: "start" }], checked("abc"));
    expect(s0.stale).toBe(true);
    const s = reduceCheck(s0, { type: "finish", generation: s0.generation, result: DONE });
    expect(s.running).toBeNull();
    expect(s.stale).toBe(false);
    expect(s.message).toBeNull();
  });

  it("a message finish keeps results and stale as they were", () => {
    const base = reduceCheck(checked("abc"), { type: "edit", text: "abcd" });
    const s = run(
      [
        { type: "start" },
        { type: "finish", generation: base.generation, result: { kind: "message", text: "busy" } },
      ],
      base,
    );
    expect(s.message).toBe("busy");
    expect(s.results).toBe(DONE);
    expect(s.stale).toBe(true);
    expect(s.running).toBeNull();
  });

  it("a discarded finish only clears running", () => {
    const base = run([{ type: "edit", text: "abc" }, { type: "start" }]);
    const discarded: CheckResult = { kind: "discarded" };
    const s = reduceCheck(base, { type: "finish", generation: base.generation, result: discarded });
    expect(s).toEqual({ ...base, running: null });
  });

  it("an older finish is dropped and only clears running", () => {
    const started = run([{ type: "edit", text: "abc" }, { type: "start" }]);
    const edited = reduceCheck(started, { type: "edit", text: "abcd" });
    const s = reduceCheck(edited, { type: "finish", generation: started.generation, result: DONE });
    expect(s.results).toBeNull();
    expect(s.stale).toBe(false);
    expect(s.running).toBeNull();
    expect(s.text).toBe("abcd");
  });

  it("clear during a run empties state and drops the in-flight result", () => {
    const started = run([
      { type: "edit", text: "abc" },
      { type: "start" },
      { type: "note", text: "n" },
    ]);
    const cleared = reduceCheck(started, { type: "clear" });
    expect(cleared).toMatchObject({
      text: "",
      results: null,
      stale: false,
      message: null,
      openNote: null,
      generation: started.generation + 1,
    });
    const s = reduceCheck(cleared, {
      type: "finish",
      generation: started.generation,
      result: DONE,
    });
    expect(s.results).toBeNull();
    expect(s.running).toBeNull();
  });

  it("note sets and clears the open note", () => {
    const s = reduceCheck(INITIAL_CHECK_STATE, { type: "note", text: "Opened" });
    expect(s.openNote).toBe("Opened");
    expect(reduceCheck(s, { type: "note", text: null }).openNote).toBeNull();
  });
});
