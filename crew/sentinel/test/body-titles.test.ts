import { STATEMENT_TITLES, buildDocx, buildStatement, renderStatement } from "@reveal-codes/export";
import { STATEMENT_TITLE, APPENDIX_TITLE } from "@reveal-codes/export";
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
import { testSleep } from "./support/test-deps.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const ISO = "2026-11-20T18:25:00.000Z";
const SECOND_TITLE = STATEMENT_TITLES[1] ?? "";

/** A filing whose own text holds a bare line equal to each of two statement titles. */
const BODY = [
  "Notice of appearance.",
  STATEMENT_TITLE,
  "Counsel enters an appearance for the defendant.",
  SECOND_TITLE,
  "Dated this day.",
].join("\n");

async function exportOf(text: string): Promise<Uint8Array> {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("document rejected");
  const meta = { now: new Date(ISO), verifiedAt: ISO };
  const built = buildStatement(created.value, [], meta, null);
  if (!built.ok) throw new Error("statement rejected");
  expect(renderStatement(built.value).length).toBeGreaterThan(0);
  return buildDocx(created.value, built.value);
}

describe("a filing that holds lines equal to statement titles", () => {
  it("uses two different titles", () => {
    expect(SECOND_TITLE).not.toBe("");
    expect(SECOND_TITLE).not.toBe(STATEMENT_TITLE);
  });

  it("is cut at the real Statement, so the body is the whole text", async () => {
    const read = readDocx(await exportOf(BODY));
    if (!read.ok) throw new Error(read.error.kind);
    const split = splitExport(read.value);
    if (!split.ok) throw new Error(split.error.kind);
    expect(split.value.body).toEqual(BODY.split("\n"));
  });

  it("still sweeps as No drift.", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sentinel-titles-"));
    dirs.push(dir);
    const file = join(dir, "titles.docx");
    writeFileSync(file, await exportOf(BODY));
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

  it("is cut at the last title before the Appendix title, not the first", () => {
    const list = [
      "a",
      STATEMENT_TITLE,
      "b",
      SECOND_TITLE,
      "c",
      STATEMENT_TITLE,
      APPENDIX_TITLE,
      "i1",
      "i2",
      "line",
    ];
    expect(splitExport(list)).toEqual({
      ok: true,
      value: { body: ["a", STATEMENT_TITLE, "b", SECOND_TITLE, "c"], appendix: ["line"] },
    });
  });

  it("ignores a title that comes after the Appendix title", () => {
    const list = ["a", STATEMENT_TITLE, APPENDIX_TITLE, "i1", "i2", STATEMENT_TITLE];
    expect(splitExport(list)).toEqual({
      ok: true,
      value: { body: ["a"], appendix: [STATEMENT_TITLE] },
    });
  });
});
