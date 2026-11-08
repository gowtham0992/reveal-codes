import type { VerifierState } from "./deps";

function settled(): undefined {
  return undefined;
}

/**
 * Runs `fn` after every earlier gated call on the same state has settled.
 * A rejection is passed to the caller and does not block later calls.
 */
export function withGate<T>(state: VerifierState, fn: () => Promise<T>): Promise<T> {
  const run = state.gateTail.value.then(fn);
  state.gateTail.value = run.then(settled, settled);
  return run;
}
