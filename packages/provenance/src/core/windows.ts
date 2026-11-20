import { makeLabel, windowRunName } from "./label.js";
import { STALE_WINDOW_MS } from "./limits.js";
import type { Clock } from "./plan.js";
import type {
  HookEvent,
  OpenWindow,
  Payload,
  ProvenanceError,
  SessionState,
  WindowState,
} from "./types.js";

/** The Session_Key of an event whose payload has no usable `session_id` (Req 3.22). */
export const NONE_KEY = "_none";

/** The state after a step and the Fault_Log lines that step owes (the Recorder names the event). */
export type Stepped = { state: WindowState; faults: ProvenanceError[] };

/** What `transition` returns; `countSession` asks the Recorder to add 1 to `sessions.json`. */
export type Transitioned = Stepped & { countSession: boolean };

function fault(kind: "window_left_open" | "no_open_window" | "no_prompt_events" | "no_session_id") {
  return { kind } satisfies ProvenanceError;
}

function hasId(payload: Payload): boolean {
  return payload.sessionId !== null && payload.sessionId !== "";
}

/** The Session_Key: the `session_id`, or `_none` when it is missing, not a string or empty. */
export function sessionKey(payload: Payload): string {
  return payload.sessionId === null || payload.sessionId === "" ? NONE_KEY : payload.sessionId;
}

function entryOf(state: WindowState, key: string): SessionState | null {
  return Object.hasOwn(state.sessions, key) ? (state.sessions[key] ?? null) : null;
}

function withEntry(state: WindowState, key: string, entry: SessionState): WindowState {
  return { ...state, sessions: { ...state.sessions, [key]: entry } };
}

function innermost(entry: SessionState): OpenWindow | null {
  return entry.windows[entry.windows.length - 1] ?? null;
}

function isStale(entry: SessionState, nowMs: number): boolean {
  return nowMs - Date.parse(entry.lastEventAt) > STALE_WINDOW_MS;
}

/**
 * Closes every window of every session idle for more than STALE_WINDOW_MS before
 * `nowMs` and drops those entries, with or without windows (Req 3.23). One
 * `window_left_open` fault for each window closed, none for an entry without one.
 */
export function sweepStale(state: WindowState, nowMs: number): Stepped {
  const faults: ProvenanceError[] = [];
  const kept: [string, SessionState][] = [];
  for (const [key, entry] of Object.entries(state.sessions)) {
    if (!isStale(entry, nowMs)) kept.push([key, entry]);
    else faults.push(...entry.windows.map(() => fault("window_left_open")));
  }
  if (kept.length === Object.keys(state.sessions).length) return { state, faults };
  return { state: { ...state, sessions: Object.fromEntries(kept) }, faults };
}

/**
 * For `promptSubmit` in a session that still has windows: closes all of that
 * session's windows and no others, with one `window_left_open` fault (Req 3.8).
 */
export function closeLeftover(state: WindowState, session: string): Stepped {
  const entry = entryOf(state, session);
  if (entry === null || entry.windows.length === 0) return { state, faults: [] };
  const closed: SessionState = { ...entry, windows: [], lastClosedBy: "leftover" };
  return { state: withEntry(state, session, closed), faults: [fault("window_left_open")] };
}

/**
 * Rule 21: (a) the innermost window of `session`; (b) else the innermost window
 * with the highest `order` among the other sessions; (c) else null. `session`
 * is null for `manual`, which begins at (b) over all sessions.
 */
export function select(state: WindowState, session: string | null): OpenWindow | null {
  const own = session === null ? null : entryOf(state, session);
  const mine = own === null ? null : innermost(own);
  if (mine !== null) return mine;
  let best: OpenWindow | null = null;
  for (const [key, entry] of Object.entries(state.sessions)) {
    const top = key === session ? null : innermost(entry);
    if (top !== null && (best === null || top.order > best.order)) best = top;
  }
  return best;
}

/** The raw `task_name`, or null when absent or empty. */
function nameOf(payload: Payload): string | null {
  return payload.taskName === null || payload.taskName === "" ? null : payload.taskName;
}

function freshEntry(now: string): SessionState {
  return {
    lastEventAt: now,
    lastClosedBy: null,
    promptSeen: false,
    noPromptCounted: false,
    windows: [],
  };
}

function openNames(state: WindowState): string[] {
  const names = Object.values(state.sessions).flatMap((s) => s.windows.map((w) => w.windowRun));
  return state.lastWindowRun === null ? names : [...names, state.lastWindowRun];
}

type Opened = { state: WindowState; entry: SessionState };

function openWindow(
  state: WindowState,
  entry: SessionState,
  event: "promptSubmit" | "preTask",
  payload: Payload,
  now: string,
): Opened {
  const label = makeLabel(payload.taskName, event);
  const time = now.slice(0, 19) + "Z";
  const windowRun = windowRunName(label.taskNumber, label.title, time, openNames(state));
  const order = state.order + 1;
  const base = {
    windowRun,
    label: label.title,
    taskNumber: label.taskNumber,
    kind: event === "promptSubmit" ? ("turn" as const) : ("task" as const),
    openedAt: now,
    order,
  };
  const spec = event === "preTask" ? payload.specName : null;
  const name = event === "preTask" ? nameOf(payload) : null;
  const withSpec: OpenWindow = spec === null ? base : { ...base, spec };
  const win: OpenWindow = name === null ? withSpec : { ...withSpec, taskName: name };
  const next = { ...state, order, lastWindowRun: windowRun };
  return { state: next, entry: { ...entry, windows: [...entry.windows, win], lastClosedBy: null } };
}

type Closed = { entry: SessionState; faults: ProvenanceError[] };

/** The index of the window a `postTask` closes: by name, innermost outwards; else the innermost task window. */
function closeIndex(entry: SessionState, name: string | null): number {
  for (let i = entry.windows.length - 1; i >= 0; i -= 1) {
    const w = entry.windows[i];
    if (w === undefined) continue;
    if (name === null ? w.kind === "task" : w.taskName === name) return i;
  }
  return -1;
}

function closePostTask(entry: SessionState, payload: Payload): Closed {
  const at = closeIndex(entry, nameOf(payload));
  if (at < 0) return { entry, faults: [fault("no_open_window")] };
  const windows = entry.windows.filter((_, i) => i !== at);
  const lastClosedBy = windows.length === 0 ? ("postTask" as const) : entry.lastClosedBy;
  return { entry: { ...entry, windows, lastClosedBy }, faults: [] };
}

function closeAgentStop(entry: SessionState): Closed {
  const empty = entry.windows.length === 0;
  const quiet = empty && entry.lastClosedBy === "postTask";
  const faults = empty && !quiet ? [fault("no_open_window")] : [];
  return { entry: { ...entry, windows: [], lastClosedBy: "agentStop" }, faults };
}

type Applied = Opened & { faults: ProvenanceError[] };

function apply(
  state: WindowState,
  entry: SessionState,
  event: "promptSubmit" | "preTask" | "postTask" | "agentStop",
  p: Payload,
  now: string,
): Applied {
  if (event === "promptSubmit") {
    return { ...openWindow(state, { ...entry, promptSeen: true }, event, p, now), faults: [] };
  }
  if (event === "preTask") {
    const name = nameOf(p);
    if (name !== null && innermost(entry)?.taskName === name) return { state, entry, faults: [] };
    return { ...openWindow(state, entry, event, p, now), faults: [] };
  }
  return { state, ...(event === "postTask" ? closePostTask(entry, p) : closeAgentStop(entry)) };
}

/**
 * The Recorder's step 5 for the session `session` (Req 3.2 to 3.7, 3.22, 3.24,
 * 3.26). `outsideFound` is true when this event attributed a difference to no
 * window. `manual` (and a null `session`) changes nothing. Pure over the state.
 */
export function transition(
  state: WindowState,
  event: HookEvent,
  session: string | null,
  payload: Payload,
  clock: Clock,
  outsideFound: boolean,
): Transitioned {
  if (event === "manual" || session === null) return { state, faults: [], countSession: false };
  const now = clock.nowIso();
  const entry = entryOf(state, session) ?? freshEntry(now);
  const applied = apply(state, entry, event, payload, now);
  const faults: ProvenanceError[] = [];
  const logNoId = !hasId(payload) && !state.noSessionIdLogged;
  if (logNoId) faults.push(fault("no_session_id"));
  faults.push(...applied.faults);
  const count =
    event === "agentStop" && outsideFound && !entry.promptSeen && !entry.noPromptCounted;
  if (count) faults.push(fault("no_prompt_events"));
  const done: SessionState = {
    ...applied.entry,
    lastEventAt: now,
    noPromptCounted: applied.entry.noPromptCounted || count,
  };
  const next = withEntry(applied.state, session, done);
  const flagged = logNoId ? { ...next, noSessionIdLogged: true } : next;
  return { state: { ...flagged, lastEventAt: now }, faults, countSession: count };
}
