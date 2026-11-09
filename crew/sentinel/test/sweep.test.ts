import { buildDocx } from "@reveal-codes/export";
import type { Deps } from "@reveal-codes/verifier";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeFiles } from "../src/files.js";
import type { FilePort } from "../src/files.js";
import { analyseAll, selectFiles } from "../src/sweep.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";
import { recordedFetch } from "./support/recorded-fetch.js";
import { testDeps } from "./support/test-deps.js";

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
