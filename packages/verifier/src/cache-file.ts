import * as nodeFs from "node:fs/promises";
import path from "node:path";
import type { CacheStore } from "./deps";
import { isRecord, parseJson } from "./json";

/** The slice of `node:fs/promises` the store uses; injectable so tests can fail a write. */
export type FileCacheFs = Readonly<{
  mkdir(dir: string, opts: { recursive: true }): Promise<unknown>;
  readFile(file: string, encoding: "utf8"): Promise<string>;
  writeFile(file: string, data: string, encoding: "utf8"): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(file: string, opts: { force: true }): Promise<void>;
}>;

const MAX_NAME_BYTES = 200;

function hex(n: number, width: number): string {
  return n.toString(16).toUpperCase().padStart(width, "0");
}

function encodeChar(ch: string): string {
  const cp = ch.codePointAt(0) as number;
  if (cp >= 0xd800 && cp <= 0xdfff) return `%u${hex(cp, 4)}`; // lone surrogate
  if (/^[a-z0-9_-]$/.test(ch)) return ch;
  if (cp < 0x80) return `%${hex(cp, 2)}`; // includes `.`, `*`, `%` and upper-case letters
  return encodeURIComponent(ch);
}

/**
 * Injective, separator-free, dot-free file name for `key`. Every ASCII character
 * outside `[a-z0-9_-]` (upper-case letters too, so case-insensitive file systems cannot
 * merge two keys) is percent-encoded; lone surrogates use `%uXXXX`, which
 * `encodeURIComponent` never emits. The empty key is `%empty` so no name starts with `.`.
 */
export function encodeKey(key: string): string {
  const stem = Array.from(key, encodeChar).join("");
  return `${stem === "" ? "%empty" : stem}.json`;
}

function nameFor(key: string): string | null {
  const name = encodeKey(key);
  return name.length > MAX_NAME_BYTES ? null : name;
}

type Stored = Readonly<{ expiresAt: string; value: unknown }>;

function readStored(text: string): Stored | null {
  const parsed = parseJson(text);
  if (!parsed.ok || !isRecord(parsed.value)) return null;
  const { expiresAt, value } = parsed.value;
  return typeof expiresAt === "string" ? { expiresAt, value } : null;
}

type Ctx = Readonly<{ dir: string; now: () => Date; fs: FileCacheFs }>;

function noop(): void {
  return undefined;
}

function readEntry(c: Ctx, name: string): Promise<unknown> {
  return c.fs.readFile(path.join(c.dir, name), "utf8").then(
    (text) => {
      const stored = readStored(text);
      if (stored === null) return undefined;
      const at = Date.parse(stored.expiresAt);
      return Number.isNaN(at) || c.now().getTime() >= at ? undefined : stored.value;
    },
    () => undefined,
  );
}

function writeEntry(c: Ctx, name: string, temp: string, body: () => string): Promise<void> {
  return Promise.resolve()
    .then(() => c.fs.mkdir(c.dir, { recursive: true }))
    .then(() => c.fs.writeFile(temp, body(), "utf8"))
    .then(() => c.fs.rename(temp, path.join(c.dir, name)))
    .then(
      () => undefined,
      () => c.fs.rm(temp, { force: true }).then(noop, noop),
    );
}

/**
 * One JSON file per key under `dir`. Writes go to a temp file in `dir` and are renamed
 * over the target. Missing, unreadable, unparseable, or expired files are misses.
 */
export function createFileCacheStore(
  opts: Readonly<{ dir: string; now: () => Date; fs?: FileCacheFs }>,
): CacheStore {
  const c: Ctx = { dir: opts.dir, now: opts.now, fs: opts.fs ?? nodeFs };
  let counter = 0;
  return {
    get(key) {
      const name = nameFor(key);
      return name === null ? Promise.resolve(undefined) : readEntry(c, name);
    },
    set(key, value, expiresAt) {
      const name = nameFor(key);
      if (name === null) return Promise.resolve();
      counter += 1;
      const temp = path.join(c.dir, `${name}.${process.pid}.${counter}.tmp`);
      return writeEntry(c, name, temp, () => JSON.stringify({ expiresAt, value }));
    },
    delete(key) {
      const name = nameFor(key);
      if (name === null) return Promise.resolve();
      return c.fs.rm(path.join(c.dir, name), { force: true }).then(noop, noop);
    },
  };
}
