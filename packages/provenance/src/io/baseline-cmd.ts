/**
 * `provenance baseline` (Req 6, design Baseline file): acts only when `baseline.json` does not
 * exist, and then writes a Baseline_Entry for every Tracked_File that has no Record. When it
 * exists nothing is added, written, rewritten or pruned; only an absent Sessions_File is created.
 * `at` is written once and no Record is created. The cache holds only the text that git cannot give back (Req 5.19).
 */
import { ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { Baseline, BaselineEntry, ProvenanceError } from "../core/types.js";
import { createBaselineCache } from "./baseline-cache.js";
import type { BaselineCache } from "./baseline-cache.js";
import type { Deps } from "./deps.js";
import { checkBlobs, hashObjects } from "./git.js";
import { acquireLock } from "./lock.js";
import { listCandidates, readCandidate } from "./scan.js";
import type { Candidate, FileRead } from "./scan.js";
import { createStore } from "./store.js";
import type { Store } from "./store.js";
type BaselineDeps = Pick<Deps, "fs" | "git" | "sha256" | "clock" | "log" | "pid">;
export type BaselineSummary = { added: number; skipped: number };
type TextFile = Extract<FileRead, { kind: "text" }>;
const READ_BATCH = 64;
const EVENT = "baseline";
/** The paths that have a Record: every `records/<path>.reveal`, found by walking the directory. */
async function listRecordPaths(deps: BaselineDeps, dir: string, prefix = ""): Promise<string[]> {
  const names = await deps.fs.readdir(prefix === "" ? dir : `${dir}/${prefix}`);
  if (!names.ok) return [];
  const found: string[] = [];
  for (const name of names.value) {
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    const stat = await deps.fs.lstat(`${dir}/${rel}`);
    if (!stat.ok) continue;
    if (stat.value.kind === "dir") found.push(...(await listRecordPaths(deps, dir, rel)));
    else if (stat.value.kind === "file" && rel.endsWith(".reveal")) found.push(rel.slice(0, -7));
  }
  return found;
}
/** Reads the files that need an entry. Over-limit, binary and unreadable files are counted. */
async function readAll(deps: BaselineDeps, root: string, files: Candidate[]) {
  const texts = new Map<string, TextFile>();
  let skipped = 0;
  for (let i = 0; i < files.length; i += READ_BATCH) {
    const batch = files.slice(i, i + READ_BATCH);
    const reads = await Promise.all(batch.map((c) => readCandidate(deps, root, c)));
    reads.forEach((read, j) => {
      if (read.kind === "text") texts.set((batch[j] as Candidate).path, read);
      else skipped += 1;
    });
  }
  return { texts, skipped };
}
/** Blob_Ids, and which of them git holds. A failed call leaves the files without a Blob_Id or uncached. */
async function blobInfo(deps: BaselineDeps, root: string, paths: string[]) {
  const ids = await hashObjects(deps, root, paths);
  if (!ids.ok) {
    await deps.log.fault({ event: EVENT, path: null, reason: "read_failed" });
    return { ids: new Map<string, string>(), held: new Map<string, boolean>() };
  }
  const held = await checkBlobs(deps, root, [...ids.value.values()]);
  if (!held.ok) await deps.log.fault({ event: EVENT, path: null, reason: "read_failed" });
  return { ids: ids.value, held: held.ok ? held.value : new Map<string, boolean>() };
}
async function writeCacheFiles(
  deps: BaselineDeps,
  cache: BaselineCache,
  texts: Map<string, TextFile>,
  needed: string[],
): Promise<void> {
  for (const path of needed) {
    const file = texts.get(path) as TextFile;
    const have = await cache.read(file.sha256);
    if (have !== null && deps.sha256(have) === file.sha256) continue;
    const written = await cache.write(file.sha256, file.bytes);
    if (!written.ok) await deps.log.fault({ event: EVENT, path, reason: "write_failed" });
  }
}
/** The entries to add, and the paths whose text goes to the cache (git cannot give it back). */
async function planEntries(
  deps: BaselineDeps,
  root: string,
  git: boolean,
  texts: Map<string, TextFile>,
) {
  const paths = [...texts.keys()];
  const info = git
    ? await blobInfo(deps, root, paths)
    : { ids: new Map<string, string>(), held: new Map<string, boolean>() };
  const entries = new Map<string, BaselineEntry>();
  const needed: string[] = [];
  for (const path of paths) {
    const sha256 = (texts.get(path) as TextFile).sha256;
    const blob = info.ids.get(path);
    entries.set(path, blob === undefined ? { sha256 } : { sha256, blob });
    if (blob === undefined || info.held.get(blob) !== true) needed.push(path);
  }
  return { entries, needed };
}
async function ensureSessions(deps: BaselineDeps, store: Store): Promise<void> {
  const stat = await deps.fs.lstat(`${store.dir}/sessions.json`);
  if (stat.ok || stat.error.code !== "ENOENT") return;
  const written = await store.writeSessions(0);
  if (!written.ok) await deps.log.fault({ event: EVENT, path: null, reason: "write_failed" });
}
/** The entries for the files that have no Record; skipped files are counted. */
async function collect(deps: BaselineDeps, root: string, store: Store) {
  const list = await listCandidates(deps, root);
  const recorded = new Set(await listRecordPaths(deps, `${store.dir}/records`));
  const todo = list.files.filter((f) => !recorded.has(f.path));
  const { texts, skipped } = await readAll(deps, root, todo);
  const plan = await planEntries(deps, root, list.git, texts);
  return { ...plan, texts, skipped };
}
async function baselineLocked(
  deps: BaselineDeps,
  root: string,
  store: Store,
): Promise<Result<BaselineSummary, ProvenanceError>> {
  const cache = createBaselineCache(deps, store.cacheDir());
  const existing = await store.readBaseline();
  if (!existing.ok) {
    await deps.log.fault({ event: EVENT, path: null, reason: existing.error.kind });
    return existing;
  }
  if (existing.value !== null) {
    // Baseline only once (Req 6.1, 6.2): an installed workspace is never re-baselined.
    await ensureSessions(deps, store);
    return ok({ added: 0, skipped: 0 });
  }
  const found = await collect(deps, root, store);
  await writeCacheFiles(deps, cache, found.texts, found.needed);
  const merged: Baseline = {
    version: 1,
    at: `${deps.clock.nowIso().slice(0, 19)}Z`,
    files: Object.fromEntries(found.entries),
  };
  const written = await store.writeBaseline(merged);
  if (!written.ok) return written;
  await cache.prune(merged);
  await ensureSessions(deps, store);
  return ok({ added: found.entries.size, skipped: found.skipped });
}
/**
 * Runs the baseline under the Recorder's lock (Req 6.8): the same wait, stale-lock rule and
 * `lock_timeout` as an event. When the lock cannot be taken it logs the reason and changes
 * nothing. A Baseline_File that cannot be read is left as it is and logged.
 */
export async function runBaseline(
  deps: BaselineDeps,
  root: string,
): Promise<Result<BaselineSummary, ProvenanceError>> {
  const store = createStore(deps, `${root}/.kiro/provenance`);
  await deps.fs.mkdirp(store.dir);
  const taken = await acquireLock(deps, `${store.dir}/lock`);
  if (!taken.ok) {
    await deps.log.fault({ event: EVENT, path: null, reason: taken.error.kind });
    return taken;
  }
  try {
    return await baselineLocked(deps, root, store);
  } finally {
    await taken.value.release();
  }
}
/** The one output line (Req 6.4). */
export function formatBaselineLine(summary: BaselineSummary): string {
  return `baseline: ${String(summary.added)} added, ${String(summary.skipped)} skipped`;
}
/**
 * `provenance baseline`: prints one line on success; exit status 0, also when the lock timed out
 * (nothing printed, nothing changed), or 1 when it could not run.
 */
export async function baselineCommand(
  deps: BaselineDeps,
  root: string,
  print: (line: string) => void,
): Promise<number> {
  const result = await runBaseline(deps, root);
  if (!result.ok) return result.error.kind === "lock_timeout" ? 0 : 1;
  print(formatBaselineLine(result.value));
  return 0;
}
