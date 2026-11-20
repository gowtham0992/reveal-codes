import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";
import { LOCK_STALE_MS, LOCK_WAIT_MS } from "../core/limits.js";
import type { ProvenanceError } from "../core/types.js";
import type { Deps } from "./deps.js";

export const LOCK_RETRY_MS = 25;

export type Lock = { release: () => Promise<void> };
type LockDeps = Pick<Deps, "fs" | "clock" | "pid">;

let staleCounter = 0;

/** Renames a lock older than LOCK_STALE_MS away (Req 3.18, design M9). True when one was removed. */
async function breakStale(deps: LockDeps, path: string): Promise<boolean> {
  const stat = await deps.fs.lstat(path);
  if (!stat.ok || deps.clock.nowMs() - stat.value.mtimeMs <= LOCK_STALE_MS) return false;
  staleCounter += 1;
  const away = `${path}.stale-${String(deps.pid)}-${String(staleCounter)}`;
  const moved = await deps.fs.rename(path, away);
  if (!moved.ok) return false;
  await deps.fs.unlink(away);
  return true;
}

/**
 * Takes the lock with `open(path, "wx")`, holding the process id and the time.
 * Retries every 25 ms for 5 s; a lock older than 30 s is renamed away and the
 * take is retried at once. On timeout the error is `lock_timeout` and nothing
 * has been changed. Any other failure to create the file is `write_failed`.
 */
export async function acquireLock(
  deps: LockDeps,
  path: string,
): Promise<Result<Lock, ProvenanceError>> {
  const started = deps.clock.nowMs();
  for (;;) {
    const body = `${String(deps.pid)} ${deps.clock.nowIso()}\n`;
    const taken = await deps.fs.writeFile(path, body, true);
    if (taken.ok)
      return ok({
        release: async () => {
          await deps.fs.unlink(path);
        },
      });
    if (taken.error.code !== "EEXIST")
      return err({ kind: "write_failed", detail: taken.error.code });
    if (await breakStale(deps, path)) continue;
    if (deps.clock.nowMs() - started >= LOCK_WAIT_MS) return err({ kind: "lock_timeout" });
    await deps.clock.timer(LOCK_RETRY_MS).done;
  }
}
