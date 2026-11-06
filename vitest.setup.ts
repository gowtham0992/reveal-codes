/**
 * Per-file timeout: `*.properties.test.ts` files get a 60 s test timeout,
 * every other test file keeps vitest's default. Property runs scale with
 * FC_NUM_RUNS (500 in `pnpm test:pbt`) and with CPU load, and a synchronous
 * `fc.assert` can pass the 5 s default under load. Setting it here keeps one
 * `engine` project per package, which `--project engine` (the on-save hook)
 * relies on.
 */
import { expect, vi } from "vitest";

const PROPERTY_TEST_TIMEOUT = 60_000;

if (expect.getState().testPath?.endsWith(".properties.test.ts") === true) {
  vi.setConfig({ testTimeout: PROPERTY_TEST_TIMEOUT });
} else {
  vi.resetConfig();
}
