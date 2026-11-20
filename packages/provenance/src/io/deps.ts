/**
 * The injected side of the Recorder: file system, git, clock, hash, standard
 * input and the Fault_Log are values passed in, so tests run on memory with no
 * disk, process or network (tech.md; design, module layout).
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { Result } from "@reveal-codes/engine";
import { err, ok } from "@reveal-codes/engine";
import type { FaultReason } from "../core/types.js";

/** A failed file-system call: the Node error code (`ENOENT`, `EEXIST`, ...), or `EIO`. */
export type FsError = { code: string };
export type FsResult<T> = Result<T, FsError>;
export type FileStat = {
  size: number;
  mtimeMs: number;
  kind: "file" | "dir" | "symlink" | "other";
};

export type FsDeps = {
  readFile: (path: string) => Promise<FsResult<Uint8Array>>;
  /** `exclusive` is `open(path, "wx")`: it fails with `EEXIST` when the path exists. */
  writeFile: (
    path: string,
    data: Uint8Array | string,
    exclusive?: boolean,
  ) => Promise<FsResult<void>>;
  appendFile: (path: string, text: string) => Promise<FsResult<void>>;
  rename: (from: string, to: string) => Promise<FsResult<void>>;
  unlink: (path: string) => Promise<FsResult<void>>;
  /** Removes an empty directory; fails with `ENOTEMPTY` otherwise. */
  rmdir: (path: string) => Promise<FsResult<void>>;
  mkdirp: (path: string) => Promise<FsResult<void>>;
  readdir: (path: string) => Promise<FsResult<string[]>>;
  /** Never follows a symbolic link. */
  lstat: (path: string) => Promise<FsResult<FileStat>>;
};

/** One git call: arguments as an array, never a shell. `missing` means no `git` program. */
export type GitFailure = { kind: "missing" | "failed"; code?: number };
export type GitDeps = {
  exec: (
    cwd: string,
    args: readonly string[],
    input?: Uint8Array,
  ) => Promise<Result<Uint8Array, GitFailure>>;
};

/** A timer that can be cancelled, so a won race leaves no live timer behind. */
export type Timer = { done: Promise<void>; cancel: () => void };
export type Clock = { nowMs: () => number; nowIso: () => string; timer: (ms: number) => Timer };

/** One Fault_Log record (design, Data Models). Never holds file, prompt or payload text. */
export type Fault = { event: string; path: string | null; reason: FaultReason };
export type Logger = { fault: (fault: Fault) => Promise<void> };

export type Deps = {
  fs: FsDeps;
  git: GitDeps;
  clock: Clock;
  /** Lowercase hex SHA-256 of the bytes. */
  sha256: (bytes: Uint8Array) => string;
  /** Standard input as chunks; it may never end. */
  stdin: AsyncIterable<Uint8Array>;
  log: Logger;
  pid: number;
};

/** The one place a Node error becomes a value (design, Error Handling). */
async function attempt<T>(run: () => Promise<T>): Promise<FsResult<T>> {
  try {
    return ok(await run());
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return err({ code: typeof code === "string" ? code : "EIO" });
  }
}

function toKind(s: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FileStat["kind"] {
  if (s.isSymbolicLink()) return "symlink";
  if (s.isFile()) return "file";
  return s.isDirectory() ? "dir" : "other";
}

function nodeFs(): FsDeps {
  const void_ = (run: () => Promise<unknown>) =>
    attempt(async () => {
      await run();
    });
  return {
    readFile: (p) => attempt(async () => new Uint8Array(await readFile(p))),
    writeFile: (p, data, exclusive = false) =>
      void_(() => writeFile(p, data, exclusive ? { flag: "wx" } : undefined)),
    appendFile: (p, text) => void_(() => appendFile(p, text)),
    rename: (a, b) => void_(() => rename(a, b)),
    unlink: (p) => void_(() => unlink(p)),
    rmdir: (p) => void_(() => rmdir(p)),
    mkdirp: (p) => void_(() => mkdir(p, { recursive: true })),
    readdir: (p) => attempt(() => readdir(p)),
    lstat: (p) =>
      attempt(async () => {
        const s = await lstat(p);
        return { size: s.size, mtimeMs: s.mtimeMs, kind: toKind(s) };
      }),
  };
}

function nodeGit(command: string): GitDeps {
  return {
    exec: (cwd, args, input) =>
      new Promise((resolve) => {
        const child = execFile(
          command,
          [...args],
          { cwd, encoding: "buffer", maxBuffer: 1 << 28 },
          (error, stdout) => {
            if (error === null) {
              resolve(ok(new Uint8Array(stdout)));
              return;
            }
            const code = (error as { code?: unknown }).code;
            if (code === "ENOENT") {
              resolve(err({ kind: "missing" }));
              return;
            }
            resolve(err(typeof code === "number" ? { kind: "failed", code } : { kind: "failed" }));
          },
        );
        child.stdin?.on("error", () => undefined);
        child.stdin?.end(input);
      }),
  };
}

function nodeClock(): Clock {
  return {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
    timer: (ms) => {
      let handle: ReturnType<typeof setTimeout> | undefined;
      const done = new Promise<void>((resolve) => {
        handle = setTimeout(resolve, ms);
      });
      return {
        done,
        cancel: () => {
          clearTimeout(handle);
        },
      };
    },
  };
}

/**
 * The real dependencies. `log` discards until the Recorder finds the
 * Record_Directory and replaces it with `createFaultLog` (faults.ts).
 */
export function nodeDeps(gitCommand = "git"): Deps {
  return {
    fs: nodeFs(),
    git: nodeGit(gitCommand),
    clock: nodeClock(),
    sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
    stdin: process.stdin,
    log: { fault: () => Promise.resolve() },
    pid: process.pid,
  };
}
