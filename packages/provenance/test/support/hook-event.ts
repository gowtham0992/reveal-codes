import { encodeState } from "../../src/core/state-codec.js";
import type { WindowState } from "../../src/core/types.js";
import type { TempDir } from "./temp-repo.js";
export const HOOK_EVENT_AT = "2026-11-19T10:00:00.000Z";
/** A `state.json` in `dir` that holds a hook event, so that `reveal` prints no no-event warning. */
export function markHookEvent(dir: TempDir, at: string = HOOK_EVENT_AT): void {
  const state: WindowState = {
    version: 1,
    order: 0,
    lastWindowRun: null,
    lastEventAt: null,
    lastHookEventAt: at,
    recordedAtMs: 0,
    noSessionIdLogged: false,
    sessions: {},
    files: {},
    skipped: {},
  };
  dir.write(".kiro/provenance/state.json", encodeState(state));
}
