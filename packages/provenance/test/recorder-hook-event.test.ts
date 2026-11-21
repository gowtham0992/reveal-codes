import { describe, expect, it } from "vitest";
import { PROV, manual, play, stateOf, synthetic, workspace } from "./support/event-harness.js";
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/u;
const S = "sess-hook";
const HOOK_EVENTS = ["promptSubmit", "agentStop", "preTask", "postTask"] as const;
describe("lastHookEventAt in state.json _Requirements: 3.29_", () => {
  it.each(HOOK_EVENTS)("%s sets it to the clock reading of the event", async (event) => {
    const deps = workspace();
    await play(deps, synthetic(event, S, { task_name: "1. A task" }));
    const at = (await stateOf(deps)).lastHookEventAt;
    expect(at).toMatch(ISO);
    await play(deps, synthetic(event, S, { task_name: "1. A task" }), 5000);
    const later = (await stateOf(deps)).lastHookEventAt ?? "";
    expect(Date.parse(later) - Date.parse(at ?? "")).toBeGreaterThan(0);
  });
  it("manual never sets it, and a manual event after a hook event leaves it as it was", async () => {
    const deps = workspace();
    await play(deps, manual);
    expect((await stateOf(deps)).lastHookEventAt).toBeUndefined();
    await play(deps, synthetic("promptSubmit", S));
    const held = (await stateOf(deps)).lastHookEventAt;
    expect(held).toMatch(ISO);
    await play(deps, manual, 9000);
    expect((await stateOf(deps)).lastHookEventAt).toBe(held);
  });
  it("is written to state.json under that name", async () => {
    const deps = workspace();
    await play(deps, synthetic("agentStop", S));
    expect(deps.fs.text(`${PROV}/state.json`)).toContain('"lastHookEventAt"');
  });
});
