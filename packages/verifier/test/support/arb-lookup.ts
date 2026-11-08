import * as fc from "fast-check";

// ---- Property 1 (lookup response shapes) ----

/** Line_Status values: the documented five, plus values outside the set. */
const arbEntryStatus: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 12, arbitrary: fc.constantFrom(200, 300, 400, 404, 429) },
  { weight: 3, arbitrary: fc.constantFrom(0, 201, 301, 403, 500, -1, 1.5) },
  { weight: 1, arbitrary: fc.constantFrom("200", null, undefined, true) },
);

/** Cluster ids: valid numbers and digit strings drawn from a small pool so duplicates occur. */
const arbValidClusterId: fc.Arbitrary<unknown> = fc.oneof(
  fc.integer({ min: 1, max: 4 }),
  fc.integer({ min: 1, max: 4 }).map(String),
  fc.constantFrom(9_007_199_254_740_991, "12345678901234567890"),
);

const arbMalformedClusterId: fc.Arbitrary<unknown> = fc.constantFrom(
  0,
  -3,
  1.5,
  Number.NaN,
  9_007_199_254_740_992,
  "",
  "0",
  "007",
  "1a",
  " 1",
  null,
  true,
  {},
  [],
);

/** One element of a `clusters` array: a cluster object with a good or bad id, or a non-object. */
const arbClusterItem: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: arbValidClusterId.map((id) => ({ id })) },
  { weight: 2, arbitrary: arbMalformedClusterId.map((id) => ({ id })) },
  { weight: 1, arbitrary: fc.constantFrom({}, null, "1", 7, []) },
);

const arbClusters: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 12, arbitrary: fc.array(arbClusterItem, { maxLength: 3 }) },
  { weight: 1, arbitrary: fc.constantFrom(undefined, null, "x", 3, {}) },
);

/** A `wait_until` value: millisecond-precision ISO (so it round-trips), or unusable. */
const arbWait: fc.Arbitrary<unknown> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc
      .date({
        min: new Date("2000-01-01T00:00:00.000Z"),
        max: new Date("2100-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString()),
  },
  { weight: 2, arbitrary: fc.constantFrom(undefined, undefined, null, "", "soon", 17) },
);

/** Raw JSON for one lookup entry, valid or malformed. */
export const arbLookupEntry: fc.Arbitrary<unknown> = fc.oneof(
  {
    weight: 20,
    arbitrary: fc
      .record({
        status: arbEntryStatus,
        clusters: arbClusters,
        wait_until: arbWait,
        wait_util: arbWait,
      })
      .map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) if (v !== undefined) out[k] = v;
        return out;
      }),
  },
  { weight: 1, arbitrary: fc.constantFrom(null, 5, "x", [], true) },
);

/** A response body for `lines`: usually one entry per line, sometimes the wrong length or not an array. */
export function arbLookupBody(lines: readonly string[]): fc.Arbitrary<unknown> {
  const n = lines.length;
  return fc.oneof(
    { weight: 12, arbitrary: fc.array(arbLookupEntry, { minLength: n, maxLength: n }) },
    {
      weight: 2,
      arbitrary: fc
        .array(arbLookupEntry, { minLength: 0, maxLength: n + 3 })
        .filter((a) => a.length !== n),
    },
    { weight: 1, arbitrary: fc.constantFrom(null, {}, "x", 5, { length: n }, true) },
  );
}
