/**
 * The Baseline_Cache (Req 5.19, design Baseline file): `cache/<sha256>` files that hold the
 * starting text of a file that git cannot give back. A file is named by the SHA-256 digest of its
 * bytes, so identical texts share one file. Writes go through a temporary file and a rename.
 */
import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import type { Baseline, ProvenanceError } from "../core/types.js";
import { atomicWrite } from "./atomic.js";
import type { Deps } from "./deps.js";
type CacheDeps = Pick<Deps, "fs" | "pid">;
const DIGEST_RE = /^[0-9a-f]{64}$/u;
export type BaselineCache = {
  /** The bytes of `cache/<digest>`, or null when absent or when the digest is not 64 hex characters. */
  read: (digest: string) => Promise<Uint8Array | null>;
  /** Writes `cache/<digest>` atomically. */
  write: (digest: string, bytes: Uint8Array) => Promise<Result<void, ProvenanceError>>;
  /**
   * Deletes `cache/<digest>` unless a Baseline_Entry of `baseline` has that digest. `baseline` is
   * the set of entries that remain after the caller removed its own.
   */
  release: (digest: string, baseline: Baseline | null) => Promise<Result<void, ProvenanceError>>;
  /** Deletes every `cache/<64 hex>` file that no entry of `baseline` names; returns how many. */
  prune: (baseline: Baseline) => Promise<Result<number, ProvenanceError>>;
};
function digestsOf(baseline: Baseline | null): Set<string> {
  return new Set(Object.values(baseline?.files ?? {}).map((e) => e.sha256));
}
/** The cache in directory `dir` (the store's `cacheDir()`). */
export function createBaselineCache(deps: CacheDeps, dir: string): BaselineCache {
  const remove = async (digest: string): Promise<Result<void, ProvenanceError>> => {
    const gone = await deps.fs.unlink(`${dir}/${digest}`);
    if (gone.ok || gone.error.code === "ENOENT") return ok(undefined);
    return err({ kind: "write_failed", detail: gone.error.code });
  };
  return {
    read: async (digest) => {
      if (!DIGEST_RE.test(digest)) return null;
      const read = await deps.fs.readFile(`${dir}/${digest}`);
      return read.ok ? read.value : null;
    },
    write: async (digest, bytes) => {
      if (!DIGEST_RE.test(digest)) return err({ kind: "write_failed", detail: "bad digest" });
      const written = await atomicWrite(deps, `${dir}/${digest}`, bytes);
      return written.ok ? ok(undefined) : err({ kind: "write_failed", detail: written.error.code });
    },
    release: async (digest, baseline) => {
      if (!DIGEST_RE.test(digest) || digestsOf(baseline).has(digest)) return ok(undefined);
      return remove(digest);
    },
    prune: async (baseline) => {
      const names = await deps.fs.readdir(dir);
      if (!names.ok) return ok(0);
      const named = digestsOf(baseline);
      const stale = names.value.filter((n) => DIGEST_RE.test(n) && !named.has(n));
      for (const digest of stale) {
        const removed = await remove(digest);
        if (!removed.ok) return removed;
      }
      return ok(stale.length);
    },
  };
}
