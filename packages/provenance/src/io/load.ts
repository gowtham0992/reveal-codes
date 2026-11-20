/**
 * The loader (design, The Reveal_Command and The MCP tools): reads the Records, the Baseline_File,
 * the Sessions_File and the files into plain facts for the viewer, the summary, the check and the
 * MCP tools. It writes nothing and makes no network request; a failed read is a value.
 */
import { err, ok, createDocument } from "@reveal-codes/engine";
import type { Document, Result } from "@reveal-codes/engine";
import type { CheckFacts, CheckedFile, CheckedRecord } from "../core/check.js";
import type { SessionsCount, SummaryInput } from "../core/summary.js";
import type { Baseline, BaselineEntry, ProvenanceError } from "../core/types.js";
import { createBaselineCache } from "./baseline-cache.js";
import { resolveBaselineText } from "./baseline-text.js";
import type { Deps } from "./deps.js";
import { listCandidates, readCandidate } from "./scan.js";
import type { Candidate, FileRead } from "./scan.js";
import { createStore } from "./store.js";
import type { Store } from "./store.js";

type LoadDeps = Pick<Deps, "fs" | "git" | "sha256" | "log" | "pid">;
type Loaded<T> = Promise<Result<T, ProvenanceError>>;
const READ_BATCH = 64;

/** A Record as loaded: its parsed Document, or `ok: false` when it does not parse or check. */
export type LoadedRecord = { ok: true; text: string; doc: Document } | { ok: false };

/** Everything the commands need, read once. Paths are workspace-relative. */
export type WorkspaceFacts = {
  root: string;
  /** The Tracked_Files that read as text, in path order. */
  files: CheckedFile[];
  records: Record<string, LoadedRecord>;
  /** Baseline_Entry digests by path. */
  entries: Record<string, string>;
  baseline: Baseline | null;
  sessions: SessionsCount;
};

/** One file as `reveal <file>` needs it. */
export type FileFacts = {
  read: FileRead;
  /** `null` when the file has no Record. */
  record: LoadedRecord | null;
  entry: BaselineEntry | null;
  baselineAt: string | null;
  /** The Baseline_Text when the entry's digest differs from the file; null when not found. */
  baselineText: string | null;
  /** Whether the Recorder would consider the file; known only when it has no Record and no entry. */
  listed: boolean | null;
};

/** `null` when the file has no Record; a Record that does not parse is `{ ok: false }`. */
async function loadRecord(store: Store, path: string): Loaded<LoadedRecord | null> {
  const read = await store.readRecord(path);
  if (read.ok) {
    const document = read.value?.document;
    return ok(document === undefined ? null : { ok: true, text: document.text, doc: document });
  }
  return read.error.kind === "tampered_record" ? ok({ ok: false }) : err(read.error);
}

async function loadRecords(store: Store): Loaded<Record<string, LoadedRecord>> {
  const records: Record<string, LoadedRecord> = {};
  for (const path of (await store.listRecords()).sort()) {
    const loaded = await loadRecord(store, path);
    if (!loaded.ok) return loaded;
    if (loaded.value !== null) records[path] = loaded.value;
  }
  return ok(records);
}

async function readTexts(deps: LoadDeps, root: string, list: Candidate[]): Promise<CheckedFile[]> {
  const files: CheckedFile[] = [];
  for (let i = 0; i < list.length; i += READ_BATCH) {
    const batch = list.slice(i, i + READ_BATCH);
    const reads = await Promise.all(batch.map((c) => readCandidate(deps, root, c)));
    reads.forEach((read, j) => {
      if (read.kind === "text") {
        files.push({ path: (batch[j] as Candidate).path, digest: read.sha256, text: read.text });
      }
    });
  }
  return files;
}

function entryDigests(baseline: Baseline | null): Record<string, string> {
  return Object.fromEntries(Object.entries(baseline?.files ?? {}).map(([p, e]) => [p, e.sha256]));
}

async function loadSessions(store: Store): Promise<SessionsCount> {
  const read = await store.readSessions();
  return read.ok ? read.value : "unreadable";
}

/** Reads the whole workspace once: Records, Baseline_File, Sessions_File and the Tracked_Files. */
export async function loadWorkspace(deps: LoadDeps, root: string): Loaded<WorkspaceFacts> {
  const store = createStore(deps, `${root}/.kiro/provenance`);
  const records = await loadRecords(store);
  if (!records.ok) return records;
  const baseline = await store.readBaseline();
  if (!baseline.ok) return baseline;
  const list = await listCandidates(deps, root);
  return ok({
    root,
    files: await readTexts(deps, root, list.files),
    records: records.value,
    entries: entryDigests(baseline.value),
    baseline: baseline.value,
    sessions: await loadSessions(store),
  });
}

async function readFileAt(deps: LoadDeps, root: string, path: string): Promise<FileRead> {
  const stat = await deps.fs.lstat(`${root}/${path}`);
  if (!stat.ok || stat.value.kind !== "file") return { kind: "absent" };
  const { size, mtimeMs } = stat.value;
  return readCandidate(deps, root, { path, size, mtimeMs });
}

async function baselineTextOf(
  deps: LoadDeps,
  root: string,
  entry: BaselineEntry | null,
  read: FileRead,
): Promise<string | null> {
  if (entry === null || (read.kind === "text" && read.sha256 === entry.sha256)) return null;
  const cache = createBaselineCache(deps, createStore(deps, `${root}/.kiro/provenance`).cacheDir());
  return resolveBaselineText(deps, root, cache, entry);
}

/** One file's facts. Lists the candidates only when the file has neither a Record nor an entry. */
export async function loadFile(deps: LoadDeps, root: string, path: string): Loaded<FileFacts> {
  const store = createStore(deps, `${root}/.kiro/provenance`);
  const record = await loadRecord(store, path);
  if (!record.ok) return record;
  const baseline = await store.readBaseline();
  if (!baseline.ok) return baseline;
  const read = await readFileAt(deps, root, path);
  const entry = baseline.value?.files[path] ?? null;
  return ok({
    read,
    record: record.value,
    entry,
    baselineAt: baseline.value?.at ?? null,
    baselineText: await baselineTextOf(deps, root, entry, read),
    listed: record.value !== null || entry !== null ? null : await isListed(deps, root, path),
  });
}

async function isListed(deps: LoadDeps, root: string, path: string): Promise<boolean> {
  return (await listCandidates(deps, root)).files.some((c) => c.path === path);
}

/** The check's facts (design `checkWorkspace`). */
export function checkFactsOf(facts: WorkspaceFacts, strict: boolean): CheckFacts {
  const records: Record<string, CheckedRecord> = {};
  for (const [path, r] of Object.entries(facts.records)) {
    records[path] = r.ok ? { ok: true, text: r.text } : { ok: false };
  }
  return { files: facts.files, records, entries: facts.entries, strict };
}

/** The summary's input; `scope` is a workspace-relative file or directory, or null for all. */
export function summaryInputOf(
  facts: WorkspaceFacts,
  scope: string | null,
  top?: number,
  all?: boolean,
): SummaryInput {
  const byPath = new Map(facts.files.map((f) => [f.path, f]));
  const records = Object.entries(facts.records).flatMap(([path, r]) =>
    r.ok ? [{ path, doc: r.doc, stale: byPath.get(path)?.text !== r.text }] : [],
  );
  const unchanged = Object.entries(facts.entries).flatMap(([path, digest]) => {
    const file = byPath.get(path);
    const keep = !Object.hasOwn(facts.records, path);
    return keep && file !== undefined
      ? [{ path, length: file.text.length, stale: file.digest !== digest }]
      : [];
  });
  return {
    records,
    unchanged,
    path: scope,
    sessions: facts.sessions,
    ...(top ? { top } : {}),
    ...(all ? { all } : {}),
  };
}

/** The Document of an Unchanged_File: the file's text as one `PST` span at the baseline time. */
export function unchangedDocument(text: string, baselineAt: string): Document | null {
  const doc = createDocument(text, baselineAt);
  return doc.ok ? doc.value : null;
}
