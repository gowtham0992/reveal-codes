import { createDocument, renderRecord } from "@reveal-codes/engine";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { LOCK_STALE_MS, LOCK_WAIT_MS, SIZE_LIMIT } from "../src/core/limits.js";
import { baselineCommand, formatBaselineLine, runBaseline } from "../src/io/baseline-cmd.js";
import { nodeDeps } from "../src/io/deps.js";
import { gitAvailable } from "./support/git-ignore.js";
import { memoryDeps } from "./support/memory-deps.js";
import type { MemoryDeps } from "./support/memory-deps.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";
const deps = nodeDeps();
const PROV = ".kiro/provenance";
let dir: TempDir | null = null;
afterEach(() => {
  dir?.cleanup();
});
useIsolatedGit();
function fresh(git: boolean): TempDir {
  dir = makeTempDir();
  if (git) dir.git("init", "-q");
  return dir;
}
const read = (d: TempDir, p: string): string => readFileSync(`${d.root}/${p}`, "utf8");
const cacheFiles = (d: TempDir): string[] =>
  existsSync(`${d.root}/${PROV}/cache`) ? readdirSync(`${d.root}/${PROV}/cache`) : [];
async function lineOf(d: TempDir): Promise<string[]> {
  const lines: string[] = [];
  expect(await baselineCommand(deps, d.root, (l) => lines.push(l))).toBe(0);
  return lines;
}
describe("provenance baseline", () => {
  it("prints exactly one line with the entries added and the files skipped", async () => {
    const d = fresh(false);
    d.write("a.txt", "a\n");
    d.write("b.txt", "b\n");
    d.write("bin.dat", new Uint8Array([1, 0, 2]));
    d.write("big.txt", "x".repeat(SIZE_LIMIT + 1));
    expect(await lineOf(d)).toEqual(["baseline: 2 added, 2 skipped"]);
    expect(formatBaselineLine({ added: 0, skipped: 0 })).toBe("baseline: 0 added, 0 skipped");
  });
  it("gives a second run nothing to add and leaves at and every byte unchanged", async () => {
    const d = fresh(false);
    d.write("a.txt", "a\n");
    await lineOf(d);
    const before = [read(d, `${PROV}/baseline.json`), read(d, `${PROV}/sessions.json`)];
    const cache = cacheFiles(d);
    expect(await lineOf(d)).toEqual(["baseline: 0 added, 0 skipped"]);
    expect([read(d, `${PROV}/baseline.json`), read(d, `${PROV}/sessions.json`)]).toEqual(before);
    expect(cacheFiles(d)).toEqual(cache);
    const at = (JSON.parse(before[0] as string) as { at: string }).at;
    expect(at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u);
  });
  it("adds a file that appears later without changing at or the first entries", async () => {
    const d = fresh(false);
    d.write("a.txt", "a\n");
    await lineOf(d);
    const first = JSON.parse(read(d, `${PROV}/baseline.json`)) as { at: string };
    d.write("z.txt", "z\n");
    expect(await lineOf(d)).toEqual(["baseline: 1 added, 0 skipped"]);
    const second = JSON.parse(read(d, `${PROV}/baseline.json`)) as {
      at: string;
      files: Record<string, unknown>;
    };
    expect(second.at).toBe(first.at);
    expect(Object.keys(second.files)).toEqual(["a.txt", "z.txt"]);
  });
  it("does not baseline a file that has a Record, and creates no Record", async () => {
    const d = fresh(false);
    d.write("a.txt", "a\n");
    d.write("r.txt", "r\n");
    const doc = createDocument("r\n", "2026-01-01T00:00:00Z");
    if (!doc.ok) throw new Error("createDocument failed");
    d.write(`${PROV}/records/r.txt.reveal`, renderRecord(doc.value, null, "full").text);
    expect(await lineOf(d)).toEqual(["baseline: 1 added, 0 skipped"]);
    const files = (JSON.parse(read(d, `${PROV}/baseline.json`)) as { files: object }).files;
    expect(Object.keys(files)).toEqual(["a.txt"]);
    expect(readdirSync(`${d.root}/${PROV}/records`)).toEqual(["r.txt.reveal"]);
  });
  it("writes sessions.json with 0 first and leaves a count of 3 alone", async () => {
    const d = fresh(false);
    d.write("a.txt", "a\n");
    await lineOf(d);
    expect(JSON.parse(read(d, `${PROV}/sessions.json`))).toEqual({
      version: 1,
      noPromptEventSessions: 0,
    });
    const three = '{ "version": 1, "noPromptEventSessions": 3 }\n';
    d.write(`${PROV}/sessions.json`, three);
    d.write("b.txt", "b\n");
    await lineOf(d);
    expect(read(d, `${PROV}/sessions.json`)).toBe(three);
  });
  it("leaves a Baseline_File that does not parse as it is, logs bad_baseline and prints nothing", async () => {
    const d = fresh(false);
    d.write("a.txt", "a\n");
    d.write(`${PROV}/baseline.json`, "{ nope");
    const lines: string[] = [];
    expect(await baselineCommand(deps, d.root, (l) => lines.push(l))).toBe(1);
    expect(lines).toEqual([]);
    expect(read(d, `${PROV}/baseline.json`)).toBe("{ nope");
  });
  it("gives every file of a directory without git a cache file, shared by identical text, and prunes unnamed ones", async () => {
    const d = fresh(false);
    d.write("a.txt", "same\n");
    d.write("b.txt", "same\n");
    d.write("c.txt", "other\n");
    await lineOf(d);
    expect(cacheFiles(d)).toHaveLength(2);
    const orphan = "f".repeat(64);
    d.write(`${PROV}/cache/${orphan}`, "orphan");
    d.write("d.txt", "d\n");
    await lineOf(d);
    expect(cacheFiles(d)).toHaveLength(3);
    expect(cacheFiles(d)).not.toContain(orphan);
  });
});
describe.skipIf(!gitAvailable())("provenance baseline in a git repository", () => {
  it("writes a cache file for the modified and the untracked file and none for the clean one", async () => {
    const d = fresh(true);
    d.write("clean.txt", "clean\n");
    d.write("mod.txt", "before\n");
    d.git("add", "-A");
    d.git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "first");
    d.write("mod.txt", "after\n");
    d.write("new.txt", "new\n");
    expect(await lineOf(d)).toEqual(["baseline: 3 added, 0 skipped"]);
    const digest = (t: string): string => createHash("sha256").update(t).digest("hex");
    expect(cacheFiles(d).sort()).toEqual([digest("after\n"), digest("new\n")].sort());
  });
  it("makes the batched calls once each: one hash-object and one cat-file --batch-check", async () => {
    const d = fresh(true);
    d.write("a.txt", "a\n");
    d.write("b.txt", "b\n");
    const calls: string[][] = [];
    const spy = {
      ...deps,
      git: {
        exec: (cwd: string, args: readonly string[], input?: Uint8Array) => {
          calls.push([...args]);
          return deps.git.exec(cwd, args, input);
        },
      },
    };
    const ran = await runBaseline(spy, d.root);
    expect(ran.ok).toBe(true);
    const named = (n: string): number => calls.filter((c) => c.includes(n)).length;
    expect([named("--stdin-paths"), named("--batch-check")]).toEqual([1, 1]);
  });
});

describe("provenance baseline and the lock (Requirement 6, criterion 8)", () => {
  const ROOT = "/ws";
  const DIR = `${ROOT}/${PROV}`;
  const LOCK = `${DIR}/lock`;
  function workspace(): MemoryDeps {
    const mem = memoryDeps();
    mem.fs.put(`${ROOT}/a.txt`, "a\n", mem.clock.nowMs() - 60_000);
    return mem;
  }
  const faultReasons = (mem: MemoryDeps): string[] => mem.faults.map((f) => f.reason);
  const snapshot = (mem: MemoryDeps): string =>
    JSON.stringify([...mem.fs.files].map(([p, e]) => [p, [...e.bytes]]).sort());
  it("gives up with lock_timeout after the wait when the lock is held, and changes no byte", async () => {
    const mem = workspace();
    mem.fs.put(LOCK, "999 now\n", mem.clock.nowMs());
    const before = snapshot(mem);
    const started = mem.clock.nowMs();
    const lines: string[] = [];
    expect(await baselineCommand(mem, ROOT, (l) => lines.push(l))).toBe(0);
    expect(lines).toEqual([]);
    expect(mem.clock.nowMs() - started).toBe(LOCK_WAIT_MS);
    expect(faultReasons(mem)).toEqual(["lock_timeout"]);
    expect(snapshot(mem)).toBe(before);
    expect(mem.fs.text(`${DIR}/baseline.json`)).toBeNull();
    expect(mem.fs.text(`${DIR}/sessions.json`)).toBeNull();
  });
  it("breaks a stale lock and baselines", async () => {
    const mem = workspace();
    mem.fs.put(LOCK, "999 old\n", mem.clock.nowMs() - LOCK_STALE_MS - 1000);
    const ran = await runBaseline(mem, ROOT);
    expect(ran).toEqual({ ok: true, value: { added: 1, skipped: 0 } });
    expect(mem.fs.text(`${DIR}/baseline.json`)).not.toBeNull();
    expect(faultReasons(mem)).toEqual([]);
  });
  it("releases the lock after a baseline", async () => {
    const mem = workspace();
    expect((await runBaseline(mem, ROOT)).ok).toBe(true);
    expect(mem.fs.text(LOCK)).toBeNull();
  });
  it("releases the lock after a failure", async () => {
    const mem = workspace();
    mem.fs.put(`${DIR}/baseline.json`, "{ nope");
    expect((await runBaseline(mem, ROOT)).ok).toBe(false);
    expect(mem.fs.text(LOCK)).toBeNull();
    expect(faultReasons(mem)).toEqual(["bad_baseline"]);
  });
});
