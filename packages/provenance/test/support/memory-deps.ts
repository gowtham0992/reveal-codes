/**
 * In-memory `Deps` for tests: a file system (path to bytes, mtime and size),
 * a fake git with an object store of blobs, a fixed clock and a recording
 * logger. No disk, no process, no network.
 */
import { createHash } from "node:crypto";
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type {
  Clock,
  Deps,
  Fault,
  FileStat,
  FsDeps,
  FsResult,
  GitDeps,
  GitFailure,
  Timer,
} from "../../src/io/deps.js";
import { CLOCK_START_MS } from "./clock.js";

const enc = new TextEncoder();
const bytesOf = (data: Uint8Array | string): Uint8Array =>
  typeof data === "string" ? enc.encode(data) : data;
const parentOf = (p: string): string =>
  p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/"));

export type FsOp =
  "read" | "write" | "append" | "rename" | "unlink" | "rmdir" | "mkdirp" | "readdir" | "lstat";
type Entry = { bytes: Uint8Array; mtimeMs: number };

export type MemoryFs = FsDeps & {
  files: Map<string, Entry>;
  dirs: Set<string>;
  /** Makes every call for which `fail(op, path)` returns an error code fail with it. */
  failWhen: (fail: ((op: FsOp, path: string) => string | null) | null) => void;
  /** Test setup: writes a file and its parents without going through `Clock` or failures. */
  put: (path: string, data: Uint8Array | string, mtimeMs?: number) => void;
  text: (path: string) => string | null;
};

export type MemoryClock = Clock & {
  advance: (ms: number) => void;
  /** Resolves every pending manual timer. */
  fireTimers: () => void;
  pendingTimers: () => number;
};

/** `instant` timers resolve at once and move the time on; `manual` timers wait for `fireTimers`. */
export function memoryClock(
  startMs = CLOCK_START_MS,
  timers: "instant" | "manual" = "instant",
): MemoryClock {
  let now = startMs;
  const pending = new Set<() => void>();
  return {
    nowMs: () => now,
    nowIso: () => new Date(now).toISOString(),
    advance: (ms) => {
      now += ms;
    },
    fireTimers: () => {
      for (const fire of [...pending]) fire();
    },
    pendingTimers: () => pending.size,
    timer: (ms): Timer => {
      if (timers === "instant") {
        now += ms;
        return { done: Promise.resolve(), cancel: () => undefined };
      }
      let fire: () => void = () => undefined;
      const done = new Promise<void>((resolve) => {
        fire = () => {
          pending.delete(fire);
          resolve();
        };
        pending.add(fire);
      });
      return { done, cancel: () => void pending.delete(fire) };
    },
  };
}

export function memoryFs(clock: Pick<Clock, "nowMs">): MemoryFs {
  const files = new Map<string, Entry>();
  const dirs = new Set<string>(["/"]);
  let failing: ((op: FsOp, path: string) => string | null) | null = null;
  const gate = <T>(op: FsOp, path: string, run: () => FsResult<T>): Promise<FsResult<T>> => {
    const code = failing === null ? null : failing(op, path);
    return Promise.resolve(code === null ? run() : err({ code }));
  };
  const mk = (path: string): void => {
    for (let d = path; !dirs.has(d); d = parentOf(d)) dirs.add(d);
  };
  const store = (path: string, data: Uint8Array | string): FsResult<void> => {
    if (!dirs.has(parentOf(path))) return err({ code: "ENOENT" });
    files.set(path, { bytes: bytesOf(data), mtimeMs: clock.nowMs() });
    return ok(undefined);
  };
  const children = (dir: string): string[] =>
    [...files.keys(), ...dirs]
      .filter((p) => p !== dir && parentOf(p) === dir)
      .map((p) => p.slice(dir === "/" ? 1 : dir.length + 1));
  const fs: MemoryFs = {
    files,
    dirs,
    failWhen: (f) => void (failing = f),
    put: (path, data, mtimeMs) => {
      mk(parentOf(path));
      files.set(path, { bytes: bytesOf(data), mtimeMs: mtimeMs ?? clock.nowMs() });
    },
    text: (path) => {
      const entry = files.get(path);
      return entry === undefined ? null : new TextDecoder().decode(entry.bytes);
    },
    readFile: (p) =>
      gate("read", p, () => {
        const e = files.get(p);
        return e === undefined ? err({ code: dirs.has(p) ? "EISDIR" : "ENOENT" }) : ok(e.bytes);
      }),
    writeFile: (p, data, exclusive = false) =>
      gate("write", p, () =>
        exclusive && (files.has(p) || dirs.has(p)) ? err({ code: "EEXIST" }) : store(p, data),
      ),
    appendFile: (p, text) =>
      gate("append", p, () => {
        const old = files.get(p);
        return store(
          p,
          old === undefined ? text : new Uint8Array([...old.bytes, ...enc.encode(text)]),
        );
      }),
    rename: (from, to) =>
      gate("rename", from, () => {
        const e = files.get(from);
        if (e === undefined) return err({ code: "ENOENT" });
        if (!dirs.has(parentOf(to))) return err({ code: "ENOENT" });
        files.delete(from);
        files.set(to, e);
        return ok(undefined);
      }),
    unlink: (p) =>
      gate("unlink", p, () => (files.delete(p) ? ok(undefined) : err({ code: "ENOENT" }))),
    rmdir: (p) =>
      gate("rmdir", p, () => {
        if (!dirs.has(p)) return err({ code: "ENOENT" });
        if (children(p).length > 0) return err({ code: "ENOTEMPTY" });
        dirs.delete(p);
        return ok(undefined);
      }),
    mkdirp: (p) => gate("mkdirp", p, () => (mk(p), ok(undefined))),
    readdir: (p) =>
      gate("readdir", p, () => (dirs.has(p) ? ok(children(p)) : err({ code: "ENOENT" }))),
    lstat: (p) =>
      gate("lstat", p, (): FsResult<FileStat> => {
        const e = files.get(p);
        if (e !== undefined) return ok({ size: e.bytes.length, mtimeMs: e.mtimeMs, kind: "file" });
        return dirs.has(p) ? ok({ size: 0, mtimeMs: 0, kind: "dir" }) : err({ code: "ENOENT" });
      }),
  };
  return fs;
}

export type MemoryGit = GitDeps & {
  blobs: Map<string, Uint8Array>;
  /** Stores bytes as a blob and returns its Blob_Id (SHA-1 of `blob <n>\0` and the bytes). */
  addBlob: (bytes: Uint8Array | string) => string;
  calls: string[][];
};

export function blobId(bytes: Uint8Array): string {
  const header = enc.encode(`blob ${String(bytes.length)}\0`);
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

const failed: Result<never, GitFailure> = err({ kind: "failed", code: 128 });

/** Understands `hash-object --no-filters --stdin-paths`, `cat-file blob <id>` and `cat-file --batch-check`. */
export function memoryGit(fs: MemoryFs): MemoryGit {
  const blobs = new Map<string, Uint8Array>();
  const calls: string[][] = [];
  const lines = (input: Uint8Array | undefined): string[] =>
    new TextDecoder()
      .decode(input ?? new Uint8Array())
      .split("\n")
      .filter((l) => l !== "");
  const out = (rows: string[]): Result<Uint8Array, GitFailure> =>
    ok(enc.encode(rows.map((r) => `${r}\n`).join("")));
  const hashPaths = (
    cwd: string,
    input: Uint8Array | undefined,
  ): Result<Uint8Array, GitFailure> => {
    const ids: string[] = [];
    for (const rel of lines(input)) {
      const e = fs.files.get(`${cwd}/${rel}`);
      if (e === undefined) return failed;
      ids.push(blobId(e.bytes));
    }
    return out(ids);
  };
  const check = (input: Uint8Array | undefined): Result<Uint8Array, GitFailure> =>
    out(
      lines(input).map((id) =>
        blobs.has(id) ? `${id} blob ${String(blobs.get(id)?.length ?? 0)}` : `${id} missing`,
      ),
    );
  return {
    blobs,
    calls,
    addBlob: (bytes) => {
      const b = bytesOf(bytes);
      const id = blobId(b);
      blobs.set(id, b);
      return id;
    },
    exec: (cwd, args, input) => {
      calls.push([...args]);
      const [cmd, a, b] = args;
      if (cmd === "hash-object" && args.includes("--stdin-paths"))
        return Promise.resolve(hashPaths(cwd, input));
      if (cmd === "cat-file" && a === "--batch-check") return Promise.resolve(check(input));
      const blob = cmd === "cat-file" && a === "blob" && b !== undefined ? blobs.get(b) : undefined;
      return Promise.resolve(blob === undefined ? failed : ok(blob));
    },
  };
}

export type MemoryDeps = Deps & {
  fs: MemoryFs;
  git: MemoryGit;
  clock: MemoryClock;
  faults: Fault[];
};

/** Never-ending standard input. */
export function openStdin(): AsyncIterable<Uint8Array> {
  return { [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }) };
}

/** Standard input that delivers `chunks` and then closes. */
export function closedStdin(...chunks: (Uint8Array | string)[]): AsyncIterable<Uint8Array> {
  const items = chunks.map(bytesOf);
  return {
    [Symbol.asyncIterator]: () => {
      let i = 0;
      return {
        next: () =>
          Promise.resolve(
            i < items.length
              ? { done: false as const, value: items[i++] as Uint8Array }
              : { done: true as const, value: undefined },
          ),
      };
    },
  };
}

export function memoryDeps(
  options: { timers?: "instant" | "manual"; stdin?: AsyncIterable<Uint8Array> } = {},
): MemoryDeps {
  const clock = memoryClock(CLOCK_START_MS, options.timers ?? "instant");
  const fs = memoryFs(clock);
  const faults: Fault[] = [];
  return {
    fs,
    git: memoryGit(fs),
    clock,
    sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
    stdin: options.stdin ?? closedStdin(),
    log: { fault: (f) => (faults.push(f), Promise.resolve()) },
    pid: 4242,
    faults,
  };
}
