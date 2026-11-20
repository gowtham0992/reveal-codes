/**
 * Gone and appeared files (Req 5.8 to 5.13, design Renames and deletions): a Record or entry whose
 * path is no longer a candidate is gone; a candidate with neither is appeared. `pairRenames` pairs
 * them by digest; a pair moves the Record or the entry's path, and everything else is a deletion
 * plus a creation.
 */
import { renderRecord } from "@reveal-codes/engine";
import { pairRenames } from "../core/renames.js";
import type { DigestedPath, RenamePair } from "../core/renames.js";
import { appearedRecord } from "../core/update.js";
import type { Candidate } from "./scan.js";
import { attribution, commitRecord, fault, loadRecord, removeTracked } from "./recorder-work.js";
import type { TextFile, Work } from "./recorder-work.js";

export type Appeared = { c: Candidate; read: TextFile };

const encoder = new TextEncoder();

/** The gone paths with the digest of their Recorded_Text or entry; a Record that does not parse is left out. */
async function goneFiles(w: Work): Promise<DigestedPath[]> {
  const paths = new Set([...w.recordPaths, ...w.entries.keys()]);
  const gone: DigestedPath[] = [];
  for (const path of [...paths].sort()) {
    if (w.present.has(path)) continue;
    const slot = await loadRecord(w, path);
    if (slot === null) gone.push({ path, digest: w.entries.get(path)?.sha256 ?? "" });
    else if (slot.kind === "doc") {
      gone.push({ path, digest: w.ctx.deps.sha256(encoder.encode(slot.document.text)) });
    }
  }
  return gone;
}

async function moveRecord(w: Work, pair: RenamePair, target: Appeared): Promise<void> {
  const slot = await loadRecord(w, pair.from);
  if (slot === null || slot.kind !== "doc") return;
  const text = renderRecord(slot.document, null, "full").text;
  const written = await w.ctx.store.writeRecord(pair.to, text);
  if (!written.ok) {
    await fault(w, pair.to, "write_failed");
    return;
  }
  w.recordPaths.add(pair.to);
  w.slots.set(pair.to, slot);
  await removeTracked(w, pair.from);
  w.files.set(pair.to, { ...hintOf(w, target), digest: target.read.sha256 });
}

function hintOf(w: Work, target: Appeared) {
  return {
    size: target.c.size,
    mtimeMs: target.c.mtimeMs,
    digest: target.read.sha256,
    seenMs: w.ctx.deps.clock.nowMs(),
  };
}

async function movePair(w: Work, pair: RenamePair, target: Appeared): Promise<void> {
  const entry = w.entries.get(pair.from);
  if (entry === undefined) return moveRecord(w, pair, target);
  w.entries.delete(pair.from);
  w.entries.set(pair.to, entry);
  w.baselineChanged = true;
  w.files.delete(pair.from);
  w.files.set(pair.to, hintOf(w, target));
}

async function createAppeared(w: Work, target: Appeared): Promise<void> {
  if (w.baselineBad) return; // an unreadable Baseline_File may hide this file's entry (Req 5.18)
  const { origin, window } = attribution(w);
  const made = appearedRecord(target.read.text, origin, window, w.clock);
  if (!made.ok) {
    await fault(w, target.c.path, made.error.kind);
    return;
  }
  const done = await commitRecord(w, target.c, target.read, made.value);
  if (done && origin === "HUM" && target.read.text !== "") w.outside = true;
}

/** Pairs renames, deletes what is gone and creates what appeared (Req 5.8 to 5.13). */
export async function settleMoves(w: Work, appeared: readonly Appeared[]): Promise<void> {
  const gone = await goneFiles(w);
  const byPath = new Map(appeared.map((a) => [a.c.path, a]));
  const pairs = pairRenames(
    gone,
    appeared.map((a) => ({ path: a.c.path, digest: a.read.sha256 })),
  );
  const moved = new Set(pairs.map((p) => p.to));
  const paired = new Set(pairs.map((p) => p.from));
  for (const pair of pairs) await movePair(w, pair, byPath.get(pair.to) as Appeared);
  for (const { path } of gone) if (!paired.has(path)) await removeTracked(w, path);
  for (const target of appeared) if (!moved.has(target.c.path)) await createAppeared(w, target);
}
