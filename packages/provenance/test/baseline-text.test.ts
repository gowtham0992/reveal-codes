import { afterEach, describe, expect, it } from "vitest";
import { createBaselineCache } from "../src/io/baseline-cache.js";
import { runBaseline } from "../src/io/baseline-cmd.js";
import { resolveBaselineText } from "../src/io/baseline-text.js";
import { nodeDeps } from "../src/io/deps.js";
import { createStore } from "../src/io/store.js";
import { gitAvailable } from "./support/git-ignore.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";
const deps = nodeDeps();
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
function commit(d: TempDir, message: string): void {
  d.git("add", "-A");
  d.git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
}
/** Baselines the directory (without the Record_Directory in the way) and resolves one path. */
async function resolveAfterBaseline(d: TempDir, path: string, mutate?: () => void) {
  const ran = await runBaseline(deps, d.root);
  expect(ran.ok).toBe(true);
  mutate?.();
  const store = createStore(deps, `${d.root}/.kiro/provenance`);
  const baseline = await store.readBaseline();
  const entry = baseline.ok ? baseline.value?.files[path] : undefined;
  if (entry === undefined) throw new Error(`no entry for ${path}`);
  const cache = createBaselineCache(deps, store.cacheDir());
  return { text: await resolveBaselineText(deps, d.root, cache, entry), entry, cache, store };
}
describe.skipIf(!gitAvailable())("Baseline_Text in git repositories", () => {
  it("is found by Blob_Id for a file unchanged in HEAD, and no cache file exists", async () => {
    const d = fresh(true);
    d.write("a.txt", "one\ntwo\n");
    commit(d, "first");
    const r = await resolveAfterBaseline(d, "a.txt");
    expect(r.text).toBe("one\ntwo\n");
    expect(d.git("ls-files", "--others", "--", ".kiro/provenance/cache")).toBe("");
  });
  it("is found for a file changed and committed more than 20 commits after the baseline", async () => {
    const d = fresh(true);
    d.write("a.txt", "start\n");
    commit(d, "first");
    const r = await resolveAfterBaseline(d, "a.txt", () => {
      for (let i = 0; i < 22; i += 1) {
        d.write("a.txt", `change ${String(i)}\n`);
        commit(d, `c${String(i)}`);
      }
    });
    expect(r.text).toBe("start\n");
  });
  it("is found for a file whose blob is reachable only from an older commit", async () => {
    const d = fresh(true);
    d.write("a.txt", "old\n");
    commit(d, "first");
    const r = await resolveAfterBaseline(d, "a.txt", () => {
      d.write("a.txt", "new\n");
      commit(d, "second");
    });
    expect(d.git("show", "HEAD:a.txt")).toBe("new\n");
    expect(r.text).toBe("old\n");
  });
  it("reads an untracked file and a modified file from the cache", async () => {
    const d = fresh(true);
    d.write("m.txt", "committed\n");
    commit(d, "first");
    d.write("m.txt", "modified\n");
    d.write("u.txt", "untracked\n");
    const m = await resolveAfterBaseline(d, "m.txt");
    const u = await resolveAfterBaseline(d, "u.txt");
    expect([m.text, u.text]).toEqual(["modified\n", "untracked\n"]);
    expect(m.entry.blob).toBeDefined();
    expect(await m.cache.read(m.entry.sha256)).not.toBeNull();
  });
  it("gives none for a blob gone from the object store with no cache file", async () => {
    const d = fresh(true);
    d.write("a.txt", "text\n");
    commit(d, "first");
    const r = await resolveAfterBaseline(d, "a.txt");
    const gone = { sha256: r.entry.sha256, blob: "a".repeat(40) };
    expect(await resolveBaselineText(deps, d.root, r.cache, gone)).toBeNull();
  });
  it("keeps a blob whose line-ending conversion differs: the Blob_Id is that of the exact bytes", async () => {
    const d = fresh(true);
    d.write(".gitattributes", "* text eol=lf\n");
    d.write("crlf.txt", "a\r\nb\r\n");
    commit(d, "first");
    const exact = d.git("hash-object", "--no-filters", "crlf.txt").trim();
    const r = await resolveAfterBaseline(d, "crlf.txt");
    expect(r.entry.blob).toBe(exact);
    expect(d.git("rev-parse", "HEAD:crlf.txt").trim()).not.toBe(exact);
    expect(r.text).toBe("a\r\nb\r\n");
  });
});
describe("Baseline_Text from the cache", () => {
  it("reads a file of a directory without git from the cache", async () => {
    const d = fresh(false);
    d.write("a.txt", "plain\n");
    const r = await resolveAfterBaseline(d, "a.txt");
    expect(r.entry.blob).toBeUndefined();
    expect(r.text).toBe("plain\n");
  });
  it("does not use a cache file whose bytes do not match its name", async () => {
    const d = fresh(false);
    d.write("a.txt", "plain\n");
    const r = await resolveAfterBaseline(d, "a.txt");
    await r.cache.write(r.entry.sha256, new TextEncoder().encode("tampered\n"));
    expect(await resolveBaselineText(deps, d.root, r.cache, r.entry)).toBeNull();
  });
});
