import { afterEach, describe, expect, it } from "vitest";
import { SIZE_LIMIT } from "../src/core/limits.js";
import { nodeDeps } from "../src/io/deps.js";
import { listCandidates, readCandidate } from "../src/io/scan.js";
import type { FileRead } from "../src/io/scan.js";
import { gitAvailable } from "./support/git-ignore.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";

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

async function paths(d: TempDir): Promise<string[]> {
  return (await listCandidates(deps, d.root)).files.map((f) => f.path);
}

async function readOne(d: TempDir, path: string): Promise<FileRead> {
  const list = await listCandidates(deps, d.root);
  const found = list.files.find((f) => f.path === path);
  if (found === undefined) return { kind: "absent" };
  return readCandidate(deps, d.root, found);
}

function textLength(read: FileRead): number | null {
  return read.kind === "text" ? read.text.length : null;
}

describe("walk without git", () => {
  it("lists regular files, skips node_modules and the output directories, applies no .gitignore", async () => {
    const d = fresh();
    d.write("src/a.ts", "a");
    d.write("node_modules/p/index.js", "x");
    d.write("deep/node_modules/q.js", "x");
    d.write("dist/out.js", "x");
    d.write(".git/config", "x");
    d.write(".gitignore", "ignored.txt\n");
    d.write("ignored.txt", "i");
    const list = await listCandidates(deps, d.root);
    expect(list.git).toBe(false);
    expect(list.files.map((f) => f.path)).toEqual([".gitignore", "ignored.txt", "src/a.ts"]);
  });

  it("still applies the built-in exclusions and the two ignore files", async () => {
    const d = fresh();
    d.write("keep.txt", "k");
    d.write(".env", "S=1");
    d.write("key.pem", "x");
    d.write("a.kiro.txt", "x");
    d.write(".kiroignore", "*.kiro.txt\n");
    expect(await paths(d)).toEqual([".kiroignore", "keep.txt"]);
  });
});

describe.skipIf(!gitAvailable())("git tree", () => {
  it("lists tracked and untracked files and excludes a tracked file that a rule matches", async () => {
    const d = fresh();
    d.git("init", "-q");
    d.write("a.txt", "a");
    d.write("tracked.log", "t");
    d.git("add", "a.txt", "tracked.log");
    d.write(".gitignore", "*.log\nnode_modules/\n");
    d.write("new.txt", "n");
    d.write("node_modules/x.js", "x");
    const list = await listCandidates(deps, d.root);
    expect(list.git).toBe(true);
    expect(list.files.map((f) => f.path)).toEqual([".gitignore", "a.txt", "new.txt"]);
  });

  it("does not apply the ignore files' re-inclusion over git", async () => {
    const d = fresh();
    d.git("init", "-q");
    d.write(".gitignore", "*.log\n");
    d.write("a.log", "x");
    d.write(".kiroignore", "!a.log\n");
    expect(await paths(d)).toEqual([".gitignore", ".kiroignore"]);
  });
});

describe("symbolic links", () => {
  it("treats a symbolic link as absent and never follows it", async () => {
    const d = fresh();
    d.write("real.txt", "r");
    d.link("real.txt", "link.txt");
    d.write("tdir/inner.txt", "i");
    d.link("tdir", "linkdir");
    expect(await paths(d)).toEqual(["real.txt", "tdir/inner.txt"]);
  });
});

describe("size limit", () => {
  const sizes: [number, string][] = [
    [SIZE_LIMIT - 1, "text"],
    [SIZE_LIMIT, "text"],
    [SIZE_LIMIT + 1, "over_limit"],
  ];
  it.each(sizes)("a file of %i code units is %s", async (n, kind) => {
    const d = fresh();
    d.write("f.txt", "a".repeat(n));
    const read = await readOne(d, "f.txt");
    expect(read.kind).toBe(kind);
  });

  it("measures the decoded text, not the bytes: 100,000 three-byte characters is under the limit", async () => {
    const d = fresh();
    d.write("cjk.txt", "\u4e2d".repeat(100_000));
    const read = await readOne(d, "cjk.txt");
    expect(read.kind === "text" && read.size).toBe(300_000);
    expect(textLength(read)).toBe(100_000);
  });

  it("is over the limit without a read above 600,000 bytes, and by text length between", async () => {
    const d = fresh();
    d.write("big.txt", "a".repeat(600_001));
    d.write("mid.txt", "a".repeat(SIZE_LIMIT + 1) + "\u4e2d".repeat(10));
    expect((await readOne(d, "big.txt")).kind).toBe("over_limit");
    expect((await readOne(d, "mid.txt")).kind).toBe("over_limit");
  });

  it("keeps a leading byte order mark and counts it in the length", async () => {
    const d = fresh();
    d.write("bom.txt", "\uFEFFhi");
    d.write("edge.txt", "\uFEFF" + "a".repeat(SIZE_LIMIT - 1));
    d.write("past.txt", "\uFEFF" + "a".repeat(SIZE_LIMIT));
    const bom = await readOne(d, "bom.txt");
    expect(bom.kind === "text" && bom.text).toBe("\uFEFFhi");
    expect(bom.kind === "text" && bom.bytes.length).toBe(5);
    expect(textLength(await readOne(d, "edge.txt"))).toBe(SIZE_LIMIT);
    expect((await readOne(d, "past.txt")).kind).toBe("over_limit");
  });

  it("gives the SHA-256 of the bytes", async () => {
    const d = fresh();
    d.write("h.txt", "abc");
    const read = await readOne(d, "h.txt");
    expect(read.kind === "text" && read.sha256).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("binary files", () => {
  it("skips a file with a NUL byte and a file of invalid UTF-8", async () => {
    const d = fresh();
    d.write("nul.bin", new Uint8Array([104, 0, 105]));
    d.write("bad.txt", new Uint8Array([0xc3, 0x28]));
    expect((await readOne(d, "nul.bin")).kind).toBe("binary");
    expect((await readOne(d, "bad.txt")).kind).toBe("binary");
  });
});

describe("exclusion", () => {
  it("excludes .env and .pem files", async () => {
    const d = fresh();
    d.write("ok.txt", "o");
    d.write(".env", "S=1");
    d.write("config/.env.local", "S=1");
    d.write("cert.pem", "x");
    expect(await paths(d)).toEqual(["ok.txt"]);
  });

  it("excludes a file that .kiroignore matches and one that only .kiro/provenance/ignore matches", async () => {
    const d = fresh();
    d.write("a.txt", "a");
    d.write("b.txt", "b");
    d.write("c.txt", "c");
    d.write(".kiroignore", "a.txt\n");
    d.write(".kiro/provenance/ignore", "b.txt\n");
    expect(await paths(d)).toEqual([".kiroignore", "c.txt"]);
  });

  it("lets a ! pattern in one file never re-include a file that the other excludes", async () => {
    const d = fresh();
    d.write("a.txt", "a");
    d.write(".kiroignore", "*.txt\n");
    d.write(".kiro/provenance/ignore", "!a.txt\n");
    expect(await paths(d)).toEqual([".kiroignore"]);
  });

  it("applies negation inside one file and never re-includes a built-in exclusion", async () => {
    const d = fresh();
    d.write("a.txt", "a");
    d.write("b.txt", "b");
    d.write(".env", "S=1");
    d.write(".kiroignore", "*.txt\n!b.txt\n!.env\n");
    expect(await paths(d)).toEqual([".kiroignore", "b.txt"]);
  });
});
