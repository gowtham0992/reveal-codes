/**
 * The per-file phases of one event (design, One event, steps 6 to 9; Req 2.12, 2.13, 4.11, 4.12,
 * 5.5 to 5.18): compare each candidate with its Record or Baseline_Entry, apply the difference
 * through the pure core, and settle gone and appeared files. The caller owns the lock, the
 * windows and `state.json`; this module reads and writes Records, `baseline.json` and the cache.
 */
import { HOOK_DEADLINE_MS } from "../core/limits.js";
import { firstRecord, updateRecord } from "../core/update.js";
import type { BaselineEntry, FaultReason, WindowState } from "../core/types.js";
import { shouldLogOverLimit } from "./faults.js";
import { resolveBaselineText } from "./baseline-text.js";
import { readCandidate } from "./scan.js";
import type { Candidate, FileRead } from "./scan.js";
import { settleMoves } from "./recorder-moves.js";
import type { Appeared } from "./recorder-moves.js";
import {
  attribution,
  commitRecord,
  fault,
  hintTrusted,
  loadRecord,
  removeEntry,
  removeTracked,
  setHint,
} from "./recorder-work.js";
import type { FilesContext, RecordSlot, TextFile, Work } from "./recorder-work.js";

export type { FilesContext, StateStatus } from "./recorder-work.js";

/** What the file phases leave for the Recorder: the next `state.json` content and the outside flag. */
export type FilesOutcome = {
  state: WindowState;
  /** True when this event attributed at least one difference to no window (for `transition`). */
  outsideFound: boolean;
  /** Candidates that the deadline kept the Recorder from starting. */
  notReached: number;
};

async function createWork(ctx: FilesContext, candidates: readonly Candidate[]): Promise<Work> {
  const baseline = ctx.baseline.ok ? ctx.baseline.value : null;
  const usable = ctx.stateStatus === "ok";
  const w: Work = {
    ctx,
    clock: { nowIso: () => ctx.eventIso },
    baseline,
    baselineBad: !ctx.baseline.ok,
    baselineChanged: false,
    entries: new Map(Object.entries(baseline?.files ?? {})),
    recordPaths: new Set(await ctx.store.listRecords()),
    slots: new Map(),
    files: new Map(usable ? Object.entries(ctx.state.files) : []),
    skipped: new Map(usable ? Object.entries(ctx.state.skipped) : []),
    present: new Set(candidates.map((c) => c.path)),
    outside: false,
    release: new Set(),
  };
  if (ctx.stateStatus === "bad") await fault(w, null, "bad_state");
  if (!ctx.baseline.ok) await fault(w, null, "bad_baseline");
  // A path never has both a Record and an entry; a crash between the two writes can leave both.
  for (const path of [...w.entries.keys()]) if (w.recordPaths.has(path)) removeEntry(w, path);
  return w;
}

async function updateExisting(w: Work, c: Candidate, read: TextFile, slot: RecordSlot) {
  if (slot.kind !== "doc") {
    w.files.delete(c.path);
    return;
  }
  if (slot.document.text === read.text) {
    setHint(w, c, read.sha256);
    return;
  }
  const { origin, window } = attribution(w);
  const next = updateRecord(slot.document, read.text, origin, window, w.clock);
  if (!next.ok) {
    w.files.delete(c.path);
    await fault(w, c.path, next.error.kind);
    return;
  }
  if ((await commitRecord(w, c, read, next.value)) && origin === "HUM") w.outside = true;
}

async function firstChange(w: Work, c: Candidate, read: TextFile, entry: BaselineEntry) {
  if (read.sha256 === entry.sha256) {
    setHint(w, c, read.sha256);
    return;
  }
  const { origin, window } = attribution(w);
  const deps = w.ctx.deps;
  const text = await resolveBaselineText(deps, w.ctx.root, w.ctx.cache, entry);
  const at = w.baseline?.at ?? w.ctx.eventIso;
  const made = firstRecord(text, at, read.text, origin, window, w.clock);
  if (!made.ok) {
    w.files.delete(c.path);
    await fault(w, c.path, made.error.kind);
    return;
  }
  if (!(await commitRecord(w, c, read, made.value))) return;
  removeEntry(w, c.path);
  if (text === null) await fault(w, c.path, "baseline_text_unavailable");
  else if (origin === "HUM") w.outside = true;
}

async function handleText(w: Work, c: Candidate, read: TextFile, appeared: Appeared[]) {
  const slot = await loadRecord(w, c.path);
  if (slot !== null) return updateExisting(w, c, read, slot);
  const entry = w.entries.get(c.path);
  if (entry !== undefined) return firstChange(w, c, read, entry);
  appeared.push({ c, read });
}

async function handleRead(w: Work, c: Candidate, read: FileRead, appeared: Appeared[]) {
  if (read.kind !== "over_limit") w.skipped.delete(c.path);
  switch (read.kind) {
    case "text":
      return handleText(w, c, read, appeared);
    case "absent":
      w.present.delete(c.path);
      return;
    case "unreadable":
      w.files.delete(c.path);
      await fault(w, c.path, "read_failed");
      return;
    case "binary":
      return removeTracked(w, c.path);
    case "over_limit":
      if (shouldLogOverLimit(Object.fromEntries(w.skipped), c.path, read.size, read.mtimeMs)) {
        await fault(w, c.path, "over_limit");
      }
      w.skipped.set(c.path, { size: read.size, mtimeMs: read.mtimeMs, reason: "over_limit" });
      return removeTracked(w, c.path);
  }
}

/** True when a trusted hint says the file is what its Record or entry describes (Req 5.16). */
function unchangedByHint(w: Work, c: Candidate): boolean {
  const hint = hintTrusted(w, c);
  if (hint === null) return false;
  const entry = w.entries.get(c.path);
  return w.recordPaths.has(c.path) || (entry !== undefined && entry.sha256 === hint.digest);
}

function deadlineReason(left: number): FaultReason {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- the reason's own suffix is a number
  return `deadline_reached:${left}`;
}

function overDeadline(w: Work): boolean {
  return w.ctx.deps.clock.nowMs() - w.ctx.startMs > HOOK_DEADLINE_MS;
}

async function visitAll(w: Work, candidates: readonly Candidate[], appeared: Appeared[]) {
  for (const [i, c] of candidates.entries()) {
    if (overDeadline(w)) {
      const left = candidates.length - i;
      await fault(w, null, deadlineReason(left));
      return left;
    }
    if (unchangedByHint(w, c)) continue;
    const read = await readCandidate(w.ctx.deps, w.ctx.root, c);
    await handleRead(w, c, read, appeared);
  }
  return 0;
}

/** Writes `baseline.json` when an entry changed, then frees the cache files no entry names. */
async function finishBaseline(w: Work): Promise<void> {
  if (!w.baselineChanged || w.baseline === null) return;
  const next = { ...w.baseline, files: Object.fromEntries(w.entries) };
  const written = await w.ctx.store.writeBaseline(next);
  if (!written.ok) {
    await fault(w, null, "write_failed");
    return;
  }
  for (const digest of w.release) {
    const freed = await w.ctx.cache.release(digest, next);
    if (!freed.ok) await fault(w, null, "write_failed");
  }
}

/**
 * Runs the file phases over `candidates` (the scan's list). Records are written as each file is
 * settled, `baseline.json` after the last file; `state.json` is the caller's to write, last.
 */
export async function recordFiles(
  ctx: FilesContext,
  candidates: readonly Candidate[],
): Promise<FilesOutcome> {
  const w = await createWork(ctx, candidates);
  const appeared: Appeared[] = [];
  const notReached = await visitAll(w, candidates, appeared);
  await settleMoves(w, appeared);
  await finishBaseline(w);
  for (const path of [...w.files.keys()]) if (!w.present.has(path)) w.files.delete(path);
  for (const path of [...w.skipped.keys()]) if (!w.present.has(path)) w.skipped.delete(path);
  const state = {
    ...ctx.state,
    files: Object.fromEntries(w.files),
    skipped: Object.fromEntries(w.skipped),
  };
  return { state, outsideFound: w.outside, notReached };
}
