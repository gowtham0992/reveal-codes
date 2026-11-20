/**
 * Drives whole Recorder events (`runRecord`) over in-memory `Deps` with the captured hook payloads
 * of `fixtures/`: loads a fixture, replaces its placeholders with fixed strings, and reads back
 * the Records, `state.json`, `sessions.json` and `errors.log` that an event left.
 */
import { readFileSync } from "node:fs";
import { createStore } from "../../src/io/store.js";
import { parseRecord } from "@reveal-codes/engine";
import { encodeBaseline } from "../../src/core/baseline-codec.js";
import type { WindowState } from "../../src/core/types.js";
import { STDIN_WAIT_MS } from "../../src/core/limits.js";
import { runRecord } from "../../src/io/recorder.js";
import { closedStdin, memoryDeps } from "./memory-deps.js";
import type { MemoryDeps } from "./memory-deps.js";

export const ROOT = "/ws";
export const PROV = `${ROOT}/.kiro/provenance`;
export const BASELINE_AT = "2025-12-31T00:00:00Z";
export const HOUR_MS = 3_600_000;

export type Sent = Record<string, unknown>;
/** One Recorder event: the command-line name and the payload on standard input. */
export type Step = { event: string; payload: Sent };

const FIXTURES = new URL("../../fixtures/", import.meta.url);
const EVENT_NAMES = new Map([
  ["UserPromptSubmit", "promptSubmit"],
  ["Stop", "agentStop"],
  ["PreTaskExec", "preTask"],
  ["PostTaskExec", "postTask"],
]);

function isSent(value: unknown): value is Sent {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `<session A>` becomes `sess-A`; `<workspace>` becomes the workspace root. Other values stay. */
function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/<session ([A-Z])>/gu, "sess-$1").replace(/<workspace>/gu, ROOT);
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (isSent(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

function payloadsOf(file: string): Sent[] {
  const parsed: unknown = JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8"));
  if (!isSent(parsed)) throw new Error(`${file}: not an object`);
  const events = parsed["events"];
  const raw: unknown[] = Array.isArray(events)
    ? events.map((e: unknown) => (isSent(e) ? e["payload"] : undefined))
    : [parsed["payload"]];
  return raw.map((p) => {
    const scrubbed = scrub(p);
    if (!isSent(scrubbed)) throw new Error(`${file}: a payload is not an object`);
    return scrubbed;
  });
}

/**
 * The Hook_Events of a fixture, in captured order, with placeholders replaced. Tool-use payloads
 * (`PreToolUse`, `PostToolUse`) are not Hook_Events of the Recorder (design, Decision 6) and are left out.
 */
export function fixture(file: string): Step[] {
  const steps: Step[] = [];
  for (const payload of payloadsOf(file)) {
    const name = payload["hook_event_name"];
    const event = typeof name === "string" ? EVENT_NAMES.get(name) : undefined;
    if (event !== undefined) steps.push({ event, payload });
  }
  return steps;
}

/** The only Hook_Event of a fixture file, or the `index`th. */
export function step(file: string, index = 0): Step {
  const found = fixture(file)[index];
  if (found === undefined) throw new Error(`${file}: no event ${String(index)}`);
  return found;
}

export const manual: Step = { event: "manual", payload: {} };

/** A synthetic event for a session the fixtures hold no event of. */
export function synthetic(event: string, session: string | null, extra: Sent = {}): Step {
  const base: Sent = session === null ? { cwd: ROOT } : { session_id: session, cwd: ROOT };
  return { event, payload: { ...base, ...extra } };
}

export function workspace(): MemoryDeps {
  const deps = memoryDeps();
  deps.fs.put(`${PROV}/baseline.json`, encodeBaseline({ version: 1, at: BASELINE_AT, files: {} }));
  return deps;
}

/** The memory clock's instant timers would end the stdin wait at once; the stdin timer never fires. */
function withPatientStdin(deps: MemoryDeps, body: string): MemoryDeps {
  const timer = (ms: number) =>
    ms === STDIN_WAIT_MS
      ? { done: new Promise<void>(() => undefined), cancel: () => undefined }
      : deps.clock.timer(ms);
  return { ...deps, clock: { ...deps.clock, timer }, stdin: closedStdin(body) };
}

/** Moves the clock on by `advanceMs`, then runs the event as the command would. */
export async function play(deps: MemoryDeps, s: Step, advanceMs = 1000): Promise<void> {
  deps.clock.advance(advanceMs);
  await runRecord(withPatientStdin(deps, JSON.stringify(s.payload)), s.event, ROOT);
}

export function write(deps: MemoryDeps, path: string, text: string): void {
  deps.fs.put(`${ROOT}/${path}`, text);
}

/** The Fault_Log without its time stamps: `<event> <path or -> <reason>` per line. */
export function logLines(deps: MemoryDeps): string[] {
  return (deps.fs.text(`${PROV}/errors.log`) ?? "")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => l.split(" ").slice(1).join(" "));
}

export async function stateOf(deps: MemoryDeps): Promise<WindowState> {
  const read = await createStore(deps, PROV).readState();
  if (!read.ok || read.value === null) throw new Error("no readable state.json");
  return read.value;
}

/** The sessions of `state.json` for one Session_Key; fails when the entry is missing. */
export async function entryOf(deps: MemoryDeps, key: string) {
  const entry = (await stateOf(deps)).sessions[key];
  if (entry === undefined) throw new Error(`no session entry ${key}`);
  return entry;
}

export async function windowRuns(deps: MemoryDeps, key: string): Promise<string[]> {
  return (await entryOf(deps, key)).windows.map((w) => w.windowRun);
}

/** The count in `sessions.json`; an absent file reads as 0. */
export async function sessionCount(deps: MemoryDeps): Promise<number> {
  const read = await createStore(deps, PROV).readSessions();
  if (!read.ok) throw new Error(read.error.kind);
  return read.value;
}

export type Piece = { origin: string; runId: string | null; text: string };

export function hasRecord(deps: MemoryDeps, path: string): boolean {
  return deps.fs.text(`${PROV}/records/${path}.reveal`) !== null;
}

/** The spans of a file's Record, each with the text it covers. */
export function pieces(deps: MemoryDeps, path: string): Piece[] {
  const text = deps.fs.text(`${PROV}/records/${path}.reveal`);
  const parsed = text === null ? null : parseRecord(text);
  if (parsed === null || !parsed.ok) throw new Error(`no readable Record for ${path}`);
  const doc = parsed.value.document;
  return doc.spans.map((s) => ({
    origin: s.provenance.origin,
    runId: s.provenance.runId ?? null,
    text: doc.text.slice(s.start, s.end),
  }));
}
