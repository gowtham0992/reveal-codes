/** A clock the test advances by hand. `now()` returns a new `Date` each call. */
export type ManualClock = {
  now: () => Date;
  nowMs: () => number;
  set: (ms: number) => void;
  advance: (ms: number) => void;
};

export function createManualClock(startMs = Date.UTC(2026, 0, 1)): ManualClock {
  let current = startMs;
  return {
    now: () => new Date(current),
    nowMs: () => current,
    set: (ms) => {
      current = ms;
    },
    advance: (ms) => {
      current += ms;
    },
  };
}

type Scheduled = { id: number; at: number; fn: () => void };

/** Timers that fire only when the test advances them; `setTimeout` order is by due time, then creation. */
export type ManualTimers = {
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  advance: (ms: number) => void;
  pending: () => number;
  clock: ManualClock;
};

export function createManualTimers(clock: ManualClock = createManualClock()): ManualTimers {
  let queue: Scheduled[] = [];
  let nextId = 1;
  const runDue = (until: number): void => {
    for (;;) {
      const due = queue.filter((t) => t.at <= until).sort((a, b) => a.at - b.at || a.id - b.id);
      const first = due[0];
      if (first === undefined) return;
      queue = queue.filter((t) => t.id !== first.id);
      clock.set(Math.max(clock.nowMs(), first.at));
      first.fn();
    }
  };
  return {
    clock,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      queue.push({ id, at: clock.nowMs() + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      queue = queue.filter((t) => t.id !== id);
    },
    advance: (ms) => {
      const target = clock.nowMs() + ms;
      runDue(target);
      clock.set(target);
    },
    pending: () => queue.length,
  };
}
