type Timer = { readonly at: number; readonly resolve: () => void };

type Core = {
  current: number;
  pumping: boolean;
  readonly timers: Timer[];
  readonly sleeps: number[];
};

export type ManualClock = Readonly<{
  now: () => Date;
  nowMs: () => number;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Moves time forward by `ms`, firing due timers in order. */
  advance(ms: number): void;
  /** Every `sleep` argument, in call order. */
  sleeps: readonly number[];
  /** Timers still waiting. */
  pending(): number;
}>;

function fireEarliest(c: Core): void {
  if (c.timers.length === 0) return;
  let best = 0;
  c.timers.forEach((t, i) => {
    if (t.at < (c.timers[best] as Timer).at) best = i;
  });
  const [timer] = c.timers.splice(best, 1) as [Timer];
  c.current = Math.max(c.current, timer.at);
  timer.resolve();
}

/** Fires the earliest timer once the event loop is idle, then repeats. */
function schedulePump(c: Core): void {
  if (c.pumping || c.timers.length === 0) return;
  c.pumping = true;
  setImmediate(() => {
    c.pumping = false;
    fireEarliest(c);
    schedulePump(c);
  });
}

function sleepOn(c: Core, ms: number, signal?: AbortSignal): Promise<void> {
  c.sleeps.push(ms);
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer: Timer = { at: c.current + Math.max(0, ms), resolve };
    c.timers.push(timer);
    signal?.addEventListener(
      "abort",
      () => {
        const i = c.timers.indexOf(timer);
        if (i >= 0) c.timers.splice(i, 1);
        resolve();
      },
      { once: true },
    );
    schedulePump(c);
  });
}

function advanceOn(c: Core, ms: number): void {
  const target = c.current + ms;
  while (c.timers.some((t) => t.at <= target)) fireEarliest(c);
  c.current = target;
}

/**
 * A clock that never reads real time. When the event loop goes idle (after all
 * microtasks drain) the earliest live timer fires and the clock jumps to it, so
 * code that sleeps finishes at once. Aborted timers are removed and do not move
 * time. An aborted sleep resolves.
 */
export function createManualClock(startMs = Date.UTC(2026, 0, 1)): ManualClock {
  const c: Core = { current: startMs, pumping: false, timers: [], sleeps: [] };
  return {
    now: () => new Date(c.current),
    nowMs: () => c.current,
    sleep: (ms, signal) => sleepOn(c, ms, signal),
    advance: (ms) => {
      advanceOn(c, ms);
    },
    sleeps: c.sleeps,
    pending: () => c.timers.length,
  };
}
