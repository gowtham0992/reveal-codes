// Copy of realSleep in apps/web/src/server/deps.ts. An instantly resolving sleep makes the Verifier's timeout win every race.
/**
 * A real, abortable timer. The Verifier races every request against
 * `sleep(15000)`. Abort clears the timer and resolves, so the loser of a race
 * leaves nothing behind.
 */
export function realSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    const timer = setTimeout(done, ms);
    timer.unref();
    function done(): void {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort(): void {
      clearTimeout(timer);
      done();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
