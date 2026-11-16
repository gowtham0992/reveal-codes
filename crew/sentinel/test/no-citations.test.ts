import { buildDocx, buildStatement } from "@reveal-codes/export";
import { createDocument } from "@reveal-codes/engine";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDocx } from "../src/docx-read.js";
import { nodeFiles } from "../src/files.js";
import { run } from "../src/run.js";
import type { RunIo } from "../src/run.js";
import { splitExport } from "../src/split.js";
import { declarationFor } from "./support/export-support.js";
import { testSleep } from "./support/test-deps.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const ISO = "2026-11-20T18:25:00.000Z";
const NOTICE = "NOTICE OF APPEARANCE\n\nCounsel appears for the defendant.\nDated this day.";

async function exportOf(text: string): Promise<Uint8Array> {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("document rejected");
  const built = buildStatement(
    created.value,
    [],
    { now: new Date(ISO), verifiedAt: null },
    null,
    declarationFor(created.value, null),
  );
  if (!built.ok) throw new Error("statement rejected");
  return buildDocx(created.value, built.value);
}

describe("a filing with no citation or quotation", () => {
  it("exports the two plain sentences and still splits into body and Appendix", async () => {
    const bytes = await exportOf(NOTICE);
    const read = readDocx(bytes);
    if (!read.ok) throw new Error(read.error.kind);
    expect(read.value).toContain("3. This filing contains no legal citations.");
    expect(read.value).toContain(
      "4. This filing contains no quotations attributed to a cited decision.",
    );
    const split = splitExport(read.value);
    if (!split.ok) throw new Error(split.error.kind);
    expect(split.value.body).toEqual(NOTICE.split("\n"));
  });

  it("sweeps as No drift.", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sentinel-nocite-"));
    dirs.push(dir);
    const file = join(dir, "notice.docx");
    writeFileSync(file, await exportOf(NOTICE));
    const out: string[] = [];
    const err: string[] = [];
    const io: RunIo = {
      env: {},
      fetch: () => Promise.reject(new Error("no network in tests")),
      now: () => new Date(2026, 10, 20, 10, 30),
      sleep: testSleep,
      homeDir: tmpdir(),
      files: nodeFiles,
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
    };
    expect(await run(["check", file], io)).toBe(0);
    expect(err).toEqual([]);
    expect(out.join("").trimEnd().endsWith("No drift.")).toBe(true);
  });
});
