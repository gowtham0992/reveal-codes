import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SERVER = join("server", "provenance.mjs");
const POWER_BUNDLE = join(ROOT, "powers", "provenance", SERVER);
const INSTALLED = join(ROOT, ".kiro", "provenance", "provenance.mjs");

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("Provenance Bundle is current _Requirements: 13.9, 13.11, 16.10_", () => {
  it("rebuilding into a temp directory reproduces powers/provenance/server/provenance.mjs byte for byte", () => {
    const out = mkdtempSync(join(tmpdir(), "provenance-build-"));
    scratch.push(out);
    const run = spawnSync(
      process.execPath,
      [join(ROOT, "scripts", "build-power.mjs"), "--power", "provenance", out],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const built = readFileSync(join(out, SERVER));
    expect(built.length).toBeGreaterThan(0);
    expect(built.equals(readFileSync(POWER_BUNDLE))).toBe(true);
  }, 60_000);

  it(".kiro/provenance/provenance.mjs of this repository equals the built Power Bundle", () => {
    expect(readFileSync(INSTALLED).equals(readFileSync(POWER_BUNDLE))).toBe(true);
  });
});
