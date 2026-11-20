/**
 * A reference model of Requirement 3, criterion 21 (and the windows of criteria 2 to 6, 8, 23 and
 * 24) over the generated events, written without `src/core/windows.ts`. It says which window an
 * event's differences belong to, and what that window is called (Requirement 3, criterion 11:
 * `[<Task_Number> ]<title> <UTC time to the second>`; every event of a scenario is at least one
 * second after the one before, so no name needs a `~n` suffix).
 */
import type { GenEvent } from "../../src/testing/arb-windows.js";

const STALE_MS = 12 * 3_600_000;
const NO_ID = "_none";

/** An open window: its Window_Run and its place in the order of opening. */
export type ModelWindow = { name: string; seq: number; task: boolean; given: string | null };
type ModelSession = { windows: ModelWindow[]; lastMs: number };
export type Model = { sessions: Map<string, ModelSession>; seq: number };

export function newModel(): Model {
  return { sessions: new Map(), seq: 0 };
}

const toSecond = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;

function windowName(e: GenEvent, ms: number): string {
  const title = e.event === "promptSubmit" || e.taskName === null ? "turn" : e.taskName;
  return `${title} ${toSecond(ms)}`;
}

function innermost(s: ModelSession | undefined): ModelWindow | null {
  return s?.windows[s.windows.length - 1] ?? null;
}

/** (a) the session's own innermost window, else (b) the most recently opened innermost of the others. */
function select(model: Model, key: string): ModelWindow | null {
  const own = innermost(model.sessions.get(key));
  if (own !== null) return own;
  let best: ModelWindow | null = null;
  for (const [k, s] of model.sessions) {
    const top = k === key ? null : innermost(s);
    if (top !== null && (best === null || top.seq > best.seq)) best = top;
  }
  return best;
}

function sweep(model: Model, ms: number): void {
  for (const [k, s] of [...model.sessions]) {
    if (ms - s.lastMs > STALE_MS) model.sessions.delete(k);
  }
}

/**
 * The window that rule 21 selects for `e` at clock reading `ms`, from the windows open when the
 * event starts (after the sweep and the leftover closing); then the event's own opening or closing.
 */
export function step(model: Model, e: GenEvent, ms: number): ModelWindow | null {
  sweep(model, ms);
  const key = e.session ?? NO_ID;
  const known = model.sessions.get(key);
  if (e.event === "promptSubmit" && known !== undefined) known.windows = [];
  const selected = select(model, key);
  const mine = model.sessions.get(key) ?? { windows: [], lastMs: ms };
  if (e.event === "promptSubmit") open(model, mine, e, ms, false);
  else if (e.event === "preTask") {
    const given = e.taskName === "" ? null : e.taskName;
    const repeat = given !== null && innermost(mine)?.given === given;
    if (!repeat) open(model, mine, e, ms, true);
  } else if (e.event === "postTask") closeByName(mine, e.taskName);
  else mine.windows = [];
  mine.lastMs = ms;
  model.sessions.set(key, mine);
  return selected;
}

function open(model: Model, s: ModelSession, e: GenEvent, ms: number, task: boolean): void {
  model.seq += 1;
  const given = task && e.taskName !== "" ? e.taskName : null;
  s.windows.push({ name: windowName(e, ms), seq: model.seq, task, given });
}

/** A named postTask closes the innermost window of that name; an unnamed one the innermost task window. */
function closeByName(s: ModelSession, name: string | null): void {
  const wanted = name === "" ? null : name;
  const fits = (w: ModelWindow): boolean => (wanted === null ? w.task : w.given === wanted);
  const hit = [...s.windows].reverse().find(fits);
  if (hit !== undefined) s.windows.splice(s.windows.indexOf(hit), 1);
}
