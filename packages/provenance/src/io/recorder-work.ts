/**
 * The state of one event's file phase (design, One event, steps 6 to 9): what the Recorder holds
 * in memory while it compares files with their Records and Baseline_Entries, and the helpers
 * that the phases share. Plain data and functions; maps hold the paths, so no path is ever a
 * property name.
 */
import { renderRecord } from "@reveal-codes/engine";
import type { Document, Result } from "@reveal-codes/engine";
import { RACY_MS } from "../core/limits.js";
import type { ChangeOrigin, Clock, WindowRef } from "../core/plan.js";
import type {
  Baseline,
  BaselineEntry,
  FaultReason,
  FileCache,
  ProvenanceError,
  SkippedFile,
  WindowState,
} from "../core/types.js";
import type { BaselineCache } from "./baseline-cache.js";
import type { Deps } from "./deps.js";
import type { Candidate, FileRead } from "./scan.js";
import type { Store } from "./store.js";

export type FilesDeps = Pick<Deps, "fs" | "git" | "sha256" | "clock" | "log" | "pid">;
export type TextFile = Extract<FileRead, { kind: "text" }>;

/** What `state.json` was at the start of the event: read, absent, or present and undecodable. */
export type StateStatus = "ok" | "absent" | "bad";

export type FilesContext = {
  deps: FilesDeps;
  root: string;
  store: Store;
  cache: BaselineCache;
  /** The event name written to each Fault_Log line. */
  event: string;
  /** The Window_State after the sweep and the leftover closing; an empty state when absent or bad. */
  state: WindowState;
  stateStatus: StateStatus;
  /** The result of `store.readBaseline()`; an error is logged as `bad_baseline` and left as it is. */
  baseline: Result<Baseline | null, ProvenanceError>;
  /** The window that rule 21 selects at this event, chosen once; null means an Outside_Change. */
  window: WindowRef | null;
  /** The clock reading of the event, read once. */
  eventIso: string;
  /** `deps.clock.nowMs()` at the start of the event, for the deadline. */
  startMs: number;
};

export type RecordSlot =
  { kind: "doc"; document: Document } | { kind: "tampered" } | { kind: "unreadable" };

export type Work = {
  ctx: FilesContext;
  clock: Clock;
  baseline: Baseline | null;
  baselineBad: boolean;
  baselineChanged: boolean;
  entries: Map<string, BaselineEntry>;
  recordPaths: Set<string>;
  slots: Map<string, RecordSlot>;
  files: Map<string, FileCache>;
  skipped: Map<string, SkippedFile>;
  /** Candidate paths still present after the reads; a path that vanished or was removed is not. */
  present: Set<string>;
  /** True once a difference was attributed to no window. */
  outside: boolean;
  /** Digests whose cache file may go once `baseline.json` no longer names them. */
  release: Set<string>;
};

export function fault(w: Work, path: string | null, reason: FaultReason): Promise<void> {
  return w.ctx.deps.log.fault({ event: w.ctx.event, path, reason });
}

/** The origin and window of a difference found at this event (Req 3.21). */
export function attribution(w: Work): { origin: ChangeOrigin; window: WindowRef | null } {
  const window = w.ctx.window;
  return window === null ? { origin: "HUM", window: null } : { origin: "AI", window };
}

export function setHint(w: Work, c: Candidate, digest: string): void {
  w.files.set(c.path, {
    size: c.size,
    mtimeMs: c.mtimeMs,
    digest,
    seenMs: w.ctx.deps.clock.nowMs(),
  });
}

/** Trusted when size and time match and the time is at least `RACY_MS` older than the entry (M8). */
export function hintTrusted(w: Work, c: Candidate): FileCache | null {
  const hint = w.files.get(c.path);
  const same = hint?.size === c.size && hint.mtimeMs === c.mtimeMs;
  return hint !== undefined && same && hint.mtimeMs + RACY_MS <= hint.seenMs ? hint : null;
}

/** Removes the Baseline_Entry of `path` and queues its cache file for release. */
export function removeEntry(w: Work, path: string): void {
  const entry = w.entries.get(path);
  if (entry === undefined) return;
  w.entries.delete(path);
  w.baselineChanged = true;
  w.release.add(entry.sha256);
}

/** The parsed Record of `path`, once per event; null when the path has no Record. */
export async function loadRecord(w: Work, path: string): Promise<RecordSlot | null> {
  if (!w.recordPaths.has(path)) return null;
  const known = w.slots.get(path);
  if (known !== undefined) return known;
  const read = await w.ctx.store.readRecord(path);
  let slot: RecordSlot = { kind: "unreadable" };
  if (read.ok && read.value !== null) slot = { kind: "doc", document: read.value.document };
  else if (!read.ok && read.error.kind === "tampered_record") slot = { kind: "tampered" };
  w.slots.set(path, slot);
  if (slot.kind === "tampered") await fault(w, path, "tampered_record");
  if (slot.kind === "unreadable") await fault(w, path, "read_failed");
  return slot;
}

/**
 * Writes the Record of a file whose text the Document equals, unless the file's size or
 * modification time changed since the scan (Req 4.12). True when the Record was written.
 */
export async function commitRecord(
  w: Work,
  c: Candidate,
  read: TextFile,
  doc: Document,
): Promise<boolean> {
  const again = await w.ctx.deps.fs.lstat(`${w.ctx.root}/${c.path}`);
  const unchanged = again.ok && again.value.size === c.size && again.value.mtimeMs === c.mtimeMs;
  if (!unchanged || doc.text !== read.text) {
    w.files.delete(c.path);
    return false;
  }
  const written = await w.ctx.store.writeRecord(c.path, renderRecord(doc, null, "full").text);
  if (!written.ok) {
    w.files.delete(c.path);
    await fault(w, c.path, "write_failed");
    return false;
  }
  w.recordPaths.add(c.path);
  w.slots.set(c.path, { kind: "doc", document: doc });
  setHint(w, c, read.sha256);
  return true;
}

/**
 * Deletes the Record and the Baseline_Entry of `path`. A Record that does not parse is left as it
 * is (Req 5.14). The hint and the skipped entry go in every case.
 */
export async function removeTracked(w: Work, path: string): Promise<void> {
  w.files.delete(path);
  const slot = await loadRecord(w, path);
  if (slot !== null && slot.kind !== "doc") return;
  if (slot !== null) {
    const removed = await w.ctx.store.deleteRecord(path);
    if (removed.ok) w.recordPaths.delete(path);
    else await fault(w, path, "write_failed");
  }
  removeEntry(w, path);
}
