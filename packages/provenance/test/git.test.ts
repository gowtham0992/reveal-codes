import { afterEach, describe, expect, it } from "vitest";
import { nodeDeps } from "../src/io/deps.js";
import { catBlob, checkBlobs, hashObjects, listGitFiles } from "../src/io/git.js";
import { gitAvailable } from "./support/git-ignore.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";

const present = gitAvailable();
const deps = nodeDeps();
let dir: TempDir | null = null;
function fresh(): TempDir {
  dir = makeTempDir();
  return dir;
}
afterEach(() => {
  dir?.cleanup();
});
useIsolatedGit();

describe.skipIf(!present)("git calls in a temporary repository", () => {
  it("lists tracked and untracked files and drops a tracked file that a rule now ignores", async () => {
    const d = fresh();
    d.git("init", "-q");
    d.write("a.txt", "a");
    d.write("keep.log", "k");
    d.git("add", "a.txt", "keep.log");
    d.write(".gitignore", "*.log\nbuild-out.txt\n");
    d.write("untracked.txt", "u");
    d.write("build-out.txt", "x");
    const tree = await listGitFiles(deps, d.root);
    expect(tree.kind).toBe("tree");
    const files = tree.kind === "tree" ? [...tree.files].sort() : [];
    expect(files).toEqual([".gitignore", "a.txt", "untracked.txt"]);
  });

  it("reports a directory that is not a working tree as a value", async () => {
    const d = fresh();
    expect(await listGitFiles(deps, d.root)).toEqual({ kind: "none" });
  });

  it("reports a missing git program as a value", async () => {
    const d = fresh();
    const tree = await listGitFiles(nodeDeps("reveal-no-such-git-program"), d.root);
    expect(tree).toEqual({ kind: "none" });
  });

  it("hashes the bytes on disk, not the filtered text, in one batched call", async () => {
    const d = fresh();
    d.git("init", "-q");
    d.write(".gitattributes", "* text eol=lf\n");
    d.write("crlf.txt", "one\r\ntwo\r\n");
    d.write("plain.txt", "plain\n");
    const batched = await hashObjects(deps, d.root, ["crlf.txt", "plain.txt"]);
    expect(batched.ok).toBe(true);
    if (!batched.ok) return;
    for (const path of ["crlf.txt", "plain.txt"]) {
      expect(batched.value.get(path)).toBe(d.git("hash-object", "--no-filters", path).trim());
    }
    expect(batched.value.get("crlf.txt")).not.toBe(d.git("hash-object", "crlf.txt").trim());
  });

  it("finds a committed blob and reports the blob of a modified file as missing", async () => {
    const d = fresh();
    d.git("init", "-q");
    d.write("f.txt", "before\n");
    d.git("add", "f.txt");
    const stored = d.git("hash-object", "f.txt").trim();
    d.write("f.txt", "after\n");
    const hashed = await hashObjects(deps, d.root, ["f.txt"]);
    expect(hashed.ok).toBe(true);
    const modified = hashed.ok ? (hashed.value.get("f.txt") ?? "") : "";
    const checked = await checkBlobs(deps, d.root, [stored, modified, stored]);
    expect(checked.ok && [...checked.value]).toEqual([
      [stored, true],
      [modified, false],
    ]);
    const blob = await catBlob(deps, d.root, stored);
    expect(blob.ok && new TextDecoder().decode(blob.value)).toBe("before\n");
  });

  it("refuses a blob id that is not hexadecimal and never reaches git", async () => {
    const d = fresh();
    expect((await catBlob(deps, d.root, "--help")).ok).toBe(false);
  });
});
