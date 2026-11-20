import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeDeps } from "../src/io/deps.js";
import { colorEnvFrom } from "../src/io/env.js";
import { blobId, memoryDeps } from "./support/memory-deps.js";

let dir = "";
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "prov-deps-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("nodeDeps().fs", () => {
  it("turns a missing file, an existing exclusive create and a non-empty rmdir into error codes", async () => {
    const { fs } = nodeDeps();
    expect(await fs.readFile(join(dir, "none"))).toEqual({ ok: false, error: { code: "ENOENT" } });
    expect((await fs.writeFile(join(dir, "f"), "a", true)).ok).toBe(true);
    expect(await fs.writeFile(join(dir, "f"), "b", true)).toEqual({
      ok: false,
      error: { code: "EEXIST" },
    });
    expect((await fs.mkdirp(join(dir, "d/e"))).ok).toBe(true);
    expect(await fs.rmdir(join(dir, "d"))).toEqual({ ok: false, error: { code: "ENOTEMPTY" } });
  });

  it("reads, appends, renames, lists, stats and removes", async () => {
    const { fs } = nodeDeps();
    const a = join(dir, "a");
    await fs.writeFile(a, "x");
    await fs.appendFile(a, "y");
    await fs.rename(a, join(dir, "b"));
    const read = await fs.readFile(join(dir, "b"));
    expect(read.ok && new TextDecoder().decode(read.value)).toBe("xy");
    expect(await fs.readdir(dir)).toEqual({ ok: true, value: ["b"] });
    const stat = await fs.lstat(join(dir, "b"));
    expect(stat.ok && [stat.value.kind, stat.value.size]).toEqual(["file", 2]);
    expect((await fs.unlink(join(dir, "b"))).ok).toBe(true);
  });
});

describe("nodeDeps().git", () => {
  it("runs git with an argument array", async () => {
    const out = await nodeDeps().git.exec(dir, ["--version"]);
    expect(out.ok && new TextDecoder().decode(out.value)).toMatch(/^git version/);
  });

  it("returns `failed` for a git error and `missing` for no git program", async () => {
    const failed = await nodeDeps().git.exec(dir, ["no-such-subcommand"]);
    expect(!failed.ok && failed.error.kind).toBe("failed");
    const missing = await nodeDeps("git-does-not-exist-here").git.exec(dir, ["--version"]);
    expect(missing).toEqual({ ok: false, error: { kind: "missing" } });
  });

  it("feeds standard input", async () => {
    const out = await nodeDeps().git.exec(
      dir,
      ["hash-object", "--stdin"],
      new TextEncoder().encode("hi\n"),
    );
    expect(out.ok && new TextDecoder().decode(out.value).trim()).toBe(
      blobId(new TextEncoder().encode("hi\n")),
    );
  });
});

describe("nodeDeps() other values", () => {
  it("hashes with SHA-256 and gives a cancellable timer", async () => {
    const deps = nodeDeps();
    expect(deps.sha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const timer = deps.clock.timer(10);
    await timer.done;
    deps.clock.timer(60_000).cancel();
    expect(deps.pid).toBe(process.pid);
  });
});

describe("colorEnvFrom", () => {
  it("reads NO_COLOR as set only when non-empty, and keeps COLORTERM and TERM", () => {
    expect(colorEnvFrom({ NO_COLOR: "1", COLORTERM: "truecolor", TERM: "xterm" })).toEqual({
      noColor: true,
      colorterm: "truecolor",
      term: "xterm",
    });
    expect(colorEnvFrom({ NO_COLOR: "" })).toEqual({ noColor: false, colorterm: null, term: null });
  });
});

describe("memory deps fake git", () => {
  it("hashes paths, reports blobs and missing ones, and returns blob bytes", async () => {
    const deps = memoryDeps();
    deps.fs.put("/ws/a.txt", "hi\n");
    const id = deps.git.addBlob("kept");
    const hashed = await deps.git.exec(
      "/ws",
      ["hash-object", "--no-filters", "--stdin-paths"],
      new TextEncoder().encode("a.txt\n"),
    );
    expect(hashed.ok && new TextDecoder().decode(hashed.value)).toBe(
      `${blobId(new TextEncoder().encode("hi\n"))}\n`,
    );
    const checked = await deps.git.exec(
      "/ws",
      ["cat-file", "--batch-check"],
      new TextEncoder().encode(`${id}\n${"0".repeat(40)}\n`),
    );
    expect(checked.ok && new TextDecoder().decode(checked.value)).toBe(
      `${id} blob 4\n${"0".repeat(40)} missing\n`,
    );
    const blob = await deps.git.exec("/ws", ["cat-file", "blob", id]);
    expect(blob.ok && new TextDecoder().decode(blob.value)).toBe("kept");
    expect((await deps.git.exec("/ws", ["cat-file", "blob", "0".repeat(40)])).ok).toBe(false);
  });
});
