import { buildDocx } from "@reveal-codes/export";
import type { Deps } from "@reveal-codes/verifier";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeFiles } from "../src/files.js";
import type { FilePort } from "../src/files.js";
import { unreadable } from "../src/findings.js";
import { renderJson, renderReport } from "../src/report.js";
import { run } from "../src/run.js";
import type { RunIo } from "../src/run.js";
import { analyseAll, selectFiles } from "../src/sweep.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";
import { recordedFetch } from "./support/recorded-fetch.js";
import { testDeps, testSleep } from "./support/test-deps.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-sweep-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function demoExport(): Promise<Uint8Array> {
  const { statement } = await buildDemoDocumentStatement();
  return buildDocx(await buildDemoDocument(), statement);
}

describe("selectFiles", () => {
  it("keeps .docx in any case, drops lock files and other names, and sorts", () => {
    const names = ["b.docx", "C.DOCX", "~$A-good.docx", "notes.txt", "A-good.docx", "a.docx.bak"];
    expect(selectFiles(names)).toEqual(
      ["A-good.docx", "b.docx", "C.DOCX"].sort((x, y) => x.localeCompare(y, "en")),
    );
    expect(selectFiles(names)).toEqual(["A-good.docx", "b.docx", "C.DOCX"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(selectFiles(["~$x.docx", "x.txt"])).toEqual([]);
  });
});

/** Wraps nodeFiles and logs read starts; `settled` lists the reads that have returned. */
function loggingPort(log: string[]): FilePort {
  return {
    ...nodeFiles,
    async read(path) {
      log.push(`start ${path}`);
      const result = await nodeFiles.read(path);
      log.push(`end ${path}`);
      return result;
    },
  };
}

/**
 * A copy of `deps` whose `state` throws on the first read only. The Verifier turns a throwing
 * `fetch` into `unchecked`, but it does not catch a throwing `state`, so this reaches the
 * last-resort catch of `analyseFile`.
 */
function throwOnceState(deps: Deps): Deps {
  const descriptors = Object.getOwnPropertyDescriptors(deps);
  let reads = 0;
  const get = (): Deps["state"] => {
    reads += 1;
    if (reads === 1) throw new Error("injected failure: state read");
    return deps.state;
  };
  return Object.defineProperties({}, { ...descriptors, state: { get, enumerable: true } }) as Deps;
}

describe("analyseAll", () => {
  it("reads files strictly in order and leaves them untouched", async () => {
    const dir = tempDir();
    const bytes = await demoExport();
    const paths = ["a.docx", "b.docx"].map((f) => join(dir, f));
    for (const p of paths) writeFileSync(p, bytes);
    const before = paths.map((p) => statSync(p));
    const log: string[] = [];
    const deps = testDeps(recordedFetch().fetch);
    const targets = paths.map((path, i) => ({ file: ["a.docx", "b.docx"][i] as string, path }));
    const reports = await analyseAll(targets, loggingPort(log), deps);
    expect(reports).toEqual([
      { file: "a.docx", findings: [] },
      { file: "b.docx", findings: [] },
    ]);
    expect(log).toEqual([
      `start ${paths[0]}`,
      `end ${paths[0]}`,
      `start ${paths[1]}`,
      `end ${paths[1]}`,
    ]);
    paths.forEach((p, i) => {
      const after = statSync(p);
      expect(after.size).toBe(before[i]?.size);
      expect(after.mtimeMs).toBe(before[i]?.mtimeMs);
    });
  });

  it("reports a file that vanished after listing and goes on", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "b.docx"), await demoExport());
    const targets = [
      { file: "a-gone.docx", path: join(dir, "a-gone.docx") },
      { file: "b.docx", path: join(dir, "b.docx") },
    ];
    const reports = await analyseAll(targets, nodeFiles, testDeps(recordedFetch().fetch));
    expect(reports[0]?.findings).toEqual([
      expect.objectContaining({
        kind: "unreadable",
        file: "a-gone.docx",
        line: null,
        after: "read_failed",
      }),
    ]);
    expect(reports[1]).toEqual({ file: "b.docx", findings: [] });
  });

  it("continues with the next file after an unexpected throw", async () => {
    const dir = tempDir();
    const bytes = await demoExport();
    writeFileSync(join(dir, "a-throws.docx"), bytes);
    writeFileSync(join(dir, "b-good.docx"), bytes);
    const log: string[] = [];
    const deps = throwOnceState(testDeps(recordedFetch().fetch));
    const targets = ["a-throws.docx", "b-good.docx"].map((file) => ({
      file,
      path: join(dir, file),
    }));
    const reports = await analyseAll(targets, loggingPort(log), deps);
    expect(reports[0]?.findings).toEqual([
      expect.objectContaining({ kind: "unreadable", file: "a-throws.docx", after: "read_failed" }),
    ]);
    expect(reports[1]).toEqual({ file: "b-good.docx", findings: [] });
    expect(log.indexOf(`start ${join(dir, "b-good.docx")}`)).toBeGreaterThan(
      log.indexOf(`end ${join(dir, "a-throws.docx")}`),
    );
  });
});

const CLOCK = new Date(2026, 10, 20, 10, 30);
const TOKEN = "tok-SECRET-123";

type Captured = { out: string[]; err: string[]; io: RunIo };

function makeIo(overrides: Partial<RunIo> = {}): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const io: RunIo = {
    env: {},
    fetch: () => Promise.reject(new Error("no network in tests")),
    now: () => CLOCK,
    sleep: testSleep,
    homeDir: tmpdir(),
    files: nodeFiles,
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    ...overrides,
  };
  return { out, err, io };
}

async function fillSweepDir(): Promise<string> {
  const dir = tempDir();
  const bytes = await demoExport();
  writeFileSync(join(dir, "b-bad.docx"), "not a zip");
  writeFileSync(join(dir, "A-good.docx"), bytes);
  writeFileSync(join(dir, "~$A-good.docx"), "lock");
  writeFileSync(join(dir, "notes.txt"), "notes");
  mkdirSync(join(dir, "sub"));
  writeFileSync(join(dir, "sub", "inner.docx"), bytes);
  writeFileSync(join(dir, "C.DOCX"), bytes);
  return dir;
}

describe("run", () => {
  it("sweeps a directory in order and writes Markdown and JSON", async () => {
    const dir = await fillSweepDir();
    const log: string[] = [];
    const jsonPath = join(dir, "..", `${String(Date.now())}-report.json`);
    dirs.push(jsonPath);
    const { out, err, io } = makeIo({ files: loggingPort(log) });
    const code = await run(["sweep", dir, "--json", jsonPath], io);
    const files = [
      { file: "A-good.docx", findings: [] },
      { file: "b-bad.docx", findings: [unreadable("b-bad.docx", "not_docx")] },
      { file: "C.DOCX", findings: [] },
    ];
    const report = { sweptAt: CLOCK, mode: "fixtures" as const, files };
    expect(code).toBe(0);
    expect(err).toEqual([]);
    expect(out).toEqual([renderReport(report)]);
    expect(out[0]).toContain("3 files · 1 with findings · fixtures mode");
    expect(out[0]).toContain("Citations outside the recorded set");
    expect(JSON.parse(readFileSync(jsonPath, "utf8"))).toEqual(
      JSON.parse(renderJson(report)) as unknown,
    );
    expect(log.filter((l) => l.startsWith("start ")).map((l) => basename(l))).toEqual([
      "A-good.docx",
      "b-bad.docx",
      "C.DOCX",
    ]);
  });

  it("checks one file, and a lock file by name without a filter", async () => {
    const dir = await fillSweepDir();
    const good = makeIo();
    expect(await run(["check", join(dir, "A-good.docx")], good.io)).toBe(0);
    expect(good.out.join("")).toContain("1 file · 0 with findings");
    expect(good.out.join("")).toContain("## A-good.docx\n\nNo drift.");
    const lock = makeIo();
    expect(await run(["check", join(dir, "~$A-good.docx")], lock.io)).toBe(0);
    expect(lock.out.join("")).toContain("## ~$A-good.docx");
    expect(lock.out.join("")).toContain("not_docx");
  });

  it("--out suppresses stdout", async () => {
    const dir = await fillSweepDir();
    const outPath = join(dir, "report.md");
    const { out, io } = makeIo();
    expect(await run(["check", join(dir, "A-good.docx"), "--out", outPath], io)).toBe(0);
    expect(out).toEqual([]);
    expect(readFileSync(outPath, "utf8")).toContain("# Sentinel sweep — ");
  });

  it("exits 2 with empty stdout and no file for usage errors and bad operands", async () => {
    const dir = await fillSweepDir();
    const outPath = join(dir, "never.md");
    const cases: string[][] = [
      [],
      ["frobnicate", dir],
      ["sweep", dir, "--bogus"],
      ["sweep", join(dir, "missing"), "--out", outPath],
      ["sweep", join(dir, "notes.txt"), "--out", outPath],
      ["check", join(dir, "missing.docx"), "--out", outPath],
      ["check", dir, "--out", outPath],
    ];
    for (const argv of cases) {
      const { out, err, io } = makeIo();
      expect(await run(argv, io)).toBe(2);
      expect(out).toEqual([]);
      expect(err.join("")).not.toBe("");
    }
    expect(existsSync(outPath)).toBe(false);
    const named = makeIo();
    await run(["sweep", join(dir, "missing")], named.io);
    expect(named.err.join("")).toContain(`not a directory: ${join(dir, "missing")}`);
  });

  it("exits 1 on an unwritable --out or --json without leaking the Token", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "x.docx"), "not a zip");
    const env = { COURTLISTENER_TOKEN: TOKEN, REVEAL_CODES_CACHE_DIR: join(dir, "cache") };
    const bad = join(dir, "no-such-dir", "out.txt");
    const outRun = makeIo({ env });
    expect(await run(["sweep", dir, "--out", bad], outRun.io)).toBe(1);
    expect(outRun.err.join("")).not.toBe("");
    expect(outRun.err.join("")).not.toContain(TOKEN);
    expect(outRun.out).toEqual([]);
    expect(existsSync(bad)).toBe(false);
    const jsonRun = makeIo({ env });
    expect(await run(["sweep", dir, "--json", bad], jsonRun.io)).toBe(1);
    expect(jsonRun.err.join("")).not.toContain(TOKEN);
    expect(jsonRun.out.join("")).toContain("live mode");
    expect(existsSync(bad)).toBe(false);
  });

  it("redacts the Token from an error thrown by the file port", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "x.docx"), "not a zip");
    const files: FilePort = {
      ...nodeFiles,
      write: () => Promise.reject(new Error(`cannot write with ${TOKEN}`)),
    };
    const env = { COURTLISTENER_TOKEN: TOKEN, REVEAL_CODES_CACHE_DIR: join(dir, "cache") };
    const { out, err, io } = makeIo({ env, files });
    expect(await run(["sweep", dir, "--out", join(dir, "o.md")], io)).toBe(1);
    expect(err.join("")).toContain("[redacted]");
    expect([...out, ...err].join("")).not.toContain(TOKEN);
  });
});

describe("nodeFiles", () => {
  it("classifies paths and lists only non-directories", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "x.docx"), "x");
    expect(await nodeFiles.kind(dir)).toBe("directory");
    expect(await nodeFiles.kind(join(dir, "x.docx"))).toBe("file");
    expect(await nodeFiles.kind(join(dir, "nope"))).toBe("missing");
    expect(await nodeFiles.list(dir)).toEqual(["x.docx"]);
  });
});
