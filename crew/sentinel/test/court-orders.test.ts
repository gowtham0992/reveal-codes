import { ORDERS, buildDocx, orderById } from "@reveal-codes/export";
import type { OrderContext } from "@reveal-codes/export";
import { unzipSync } from "fflate";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeFiles } from "../src/files.js";
import { run } from "../src/run.js";
import type { RunIo } from "../src/run.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";
import { testSleep } from "./support/test-deps.js";

// _Requirements: 7.4, 9.11, 12.10, 12.11_

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function contextOf(id: string): OrderContext {
  const entry = orderById(ORDERS, id);
  if (entry === null) throw new Error(`no current entry ${id}`);
  return { entry, confidentialityCertified: false };
}

/** Exports the demo Document (one AI span) under the order, writes it, and checks it. */
async function exportAndCheck(
  id: string,
): Promise<{ bytes: Uint8Array; code: number; out: string }> {
  const { statement } = await buildDemoDocumentStatement(contextOf(id));
  expect(statement.aiUsed).toBe(true);
  const bytes = await buildDocx(await buildDemoDocument(), statement);
  const dir = mkdtempSync(join(tmpdir(), "sentinel-orders-"));
  dirs.push(dir);
  const file = join(dir, `${id}.docx`);
  writeFileSync(file, bytes);
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
  const code = await run(["check", file], io);
  expect(err).toEqual([]);
  return { bytes, code, out: out.join("") };
}

describe("Sentinel on court-specific exports _Requirements: 7.4, 9.11, 12.10, 12.11_", () => {
  it("ndtex-lr-7-2-f: a first-page header leaves the body clean", async () => {
    const { bytes, code, out } = await exportAndCheck("ndtex-lr-7-2-f");
    expect(Object.keys(unzipSync(bytes))).toContain("word/header1.xml");
    expect(code).toBe(0);
    expect(out.trimEnd().endsWith("No drift.")).toBe(true);
  });

  it("edtex-love-2025: the body is cut at the renamed title", async () => {
    const { code, out } = await exportAndCheck("edtex-love-2025");
    expect(code).toBe(0);
    expect(out.trimEnd().endsWith("No drift.")).toBe(true);
  });

  it("dhaw-go-23-1: the body is cut at the separate declaration caption", async () => {
    const { code, out } = await exportAndCheck("dhaw-go-23-1");
    expect(code).toBe(0);
    expect(out.trimEnd().endsWith("No drift.")).toBe(true);
  });
});
