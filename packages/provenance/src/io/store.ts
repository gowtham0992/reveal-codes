/**
 * The Record_Directory (design, Layout): paths, atomic writes, and reads and
 * writes of Records, `baseline.json`, `state.json` and `sessions.json`.
 * Paths use `/` on every platform. A failed read is a value, never a throw.
 */
import { err, ok, parseRecord } from "@reveal-codes/engine";
import type { DocumentRecord, Result } from "@reveal-codes/engine";
import { decodeBaseline, encodeBaseline } from "../core/baseline-codec.js";
import { decodeSessions, decodeState, encodeSessions, encodeState } from "../core/state-codec.js";
import type { Baseline, ProvenanceError, WindowState } from "../core/types.js";
import { atomicWrite } from "./atomic.js";
import type { Deps, FsError } from "./deps.js";

type StoreDeps = Pick<Deps, "fs" | "pid">;
type Fallible<T> = Promise<Result<T, ProvenanceError>>;

export type Store = {
  readonly dir: string;
  /** `<dir>/cache`, which holds `cache/<sha256>` files. */
  cacheDir: () => string;
  /** `<dir>/records/<path>.reveal`; an error for a path that could leave `records/`. */
  recordPath: (path: string) => Result<string, ProvenanceError>;
  /** `null` when there is no Record for the path. */
  readRecord: (path: string) => Fallible<DocumentRecord | null>;
  writeRecord: (path: string, recordText: string) => Fallible<void>;
  /** Removes the file, then every directory under `records/` that is now empty. */
  deleteRecord: (path: string) => Fallible<void>;
  readBaseline: () => Fallible<Baseline | null>;
  writeBaseline: (baseline: Baseline) => Fallible<void>;
  readState: () => Fallible<WindowState | null>;
  writeState: (state: WindowState) => Fallible<void>;
  /** 0 when the file is absent; `bad_sessions` when it does not parse (the file is left as it is). */
  readSessions: () => Fallible<number>;
  writeSessions: (count: number) => Fallible<void>;
};

function failed(kind: "read_failed" | "write_failed", error: FsError): ProvenanceError {
  return { kind, detail: error.code };
}

function safeRelative(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/u.test(path))
    return false;
  return path.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

async function readText(deps: StoreDeps, path: string): Fallible<string | null> {
  const read = await deps.fs.readFile(path);
  if (read.ok) return ok(new TextDecoder("utf-8").decode(read.value));
  return read.error.code === "ENOENT" ? ok(null) : err(failed("read_failed", read.error));
}

async function writeText(deps: StoreDeps, path: string, text: string): Fallible<void> {
  const written = await atomicWrite(deps, path, text);
  return written.ok ? ok(undefined) : err(failed("write_failed", written.error));
}

async function readDecoded<T>(
  deps: StoreDeps,
  path: string,
  decode: (text: string) => Result<T, ProvenanceError>,
): Fallible<T | null> {
  const text = await readText(deps, path);
  if (!text.ok) return text;
  return text.value === null ? ok(null) : decode(text.value);
}

async function pruneEmptyDirs(deps: StoreDeps, recordsDir: string, file: string): Promise<void> {
  let dir = file.slice(0, file.lastIndexOf("/"));
  while (dir.length > recordsDir.length && dir.startsWith(`${recordsDir}/`)) {
    const removed = await deps.fs.rmdir(dir);
    if (!removed.ok) return;
    dir = dir.slice(0, dir.lastIndexOf("/"));
  }
}

function recordReader(deps: StoreDeps, store: () => Store) {
  return async (path: string): Fallible<DocumentRecord | null> => {
    const file = store().recordPath(path);
    if (!file.ok) return file;
    const text = await readText(deps, file.value);
    if (!text.ok) return text;
    if (text.value === null) return ok(null);
    const parsed = parseRecord(text.value);
    return parsed.ok
      ? ok(parsed.value)
      : err({ kind: "tampered_record", detail: parsed.error.kind });
  };
}

/** The store of one Record_Directory (`<root>/.kiro/provenance`). */
export function createStore(deps: StoreDeps, dir: string): Store {
  const recordsDir = `${dir}/records`;
  const recordPath = (path: string): Result<string, ProvenanceError> =>
    safeRelative(path)
      ? ok(`${recordsDir}/${path}.reveal`)
      : err({ kind: "write_failed", detail: "unsafe path" });
  const store: Store = {
    dir,
    cacheDir: () => `${dir}/cache`,
    recordPath,
    readRecord: recordReader(deps, () => store),
    writeRecord: async (path, text) => {
      const file = recordPath(path);
      return file.ok ? writeText(deps, file.value, text) : file;
    },
    deleteRecord: async (path) => {
      const file = recordPath(path);
      if (!file.ok) return file;
      const removed = await deps.fs.unlink(file.value);
      if (!removed.ok && removed.error.code !== "ENOENT")
        return err(failed("write_failed", removed.error));
      await pruneEmptyDirs(deps, recordsDir, file.value);
      return ok(undefined);
    },
    readBaseline: () => readDecoded(deps, `${dir}/baseline.json`, decodeBaseline),
    writeBaseline: (b) => writeText(deps, `${dir}/baseline.json`, encodeBaseline(b)),
    readState: () => readDecoded(deps, `${dir}/state.json`, decodeState),
    writeState: (s) => writeText(deps, `${dir}/state.json`, encodeState(s)),
    readSessions: async () => {
      const count = await readDecoded(deps, `${dir}/sessions.json`, decodeSessions);
      return count.ok ? ok(count.value ?? 0) : count;
    },
    writeSessions: (n) => writeText(deps, `${dir}/sessions.json`, encodeSessions(n)),
  };
  return store;
}
