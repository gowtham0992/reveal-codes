/**
 * Shared fast-check run parameters for engine property tests.
 *
 * `pnpm test` runs each property 200 times; `pnpm test:pbt` sets
 * `FC_NUM_RUNS=500`. Always pass `runs()` as the parameters of `fc.assert`.
 *
 * On failure fast-check's default report includes the shrunk counterexample
 * and a line of the form `{ seed: <n>, path: "<p>", endOnFailure: true }`.
 * To replay that exact counterexample, copy the values into the call:
 *
 *   fc.assert(prop, { ...runs(), seed: <n>, path: "<p>" });
 *
 * The seed alone also reproduces it (fast-check re-shrinks from the same
 * first failure); the path skips straight to the shrunk value.
 */
export type Runs = { readonly numRuns: number };

export function runs(): Runs {
  return { numRuns: Number(process.env["FC_NUM_RUNS"] ?? "200") };
}
