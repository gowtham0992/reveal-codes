import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyDemo } from "../scripts/copy-demo";

const dirs: string[] = [];
function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "copy-demo-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("copyDemo _Requirements: 20.7_", () => {
  it("copies bytes exactly and creates the destination directory", () => {
    const dir = temp();
    const src = join(dir, "src.txt");
    const bytes = Buffer.from([0x61, 0x0d, 0x0a, 0xe2, 0x80, 0x9c, 0x00, 0x0a]);
    writeFileSync(src, bytes);
    const dest = join(dir, "public", "nested", "demo-motion.txt");
    expect(copyDemo(src, dest)).toEqual({ ok: true, value: undefined });
    expect(readFileSync(dest).equals(bytes)).toBe(true);
  });

  it("returns an error naming the source when it is missing", () => {
    const dir = temp();
    const src = join(dir, "missing.txt");
    const result = copyDemo(src, join(dir, "out", "d.txt"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(src);
  });

  it("exits non-zero with a message when run with a missing source", () => {
    const dir = temp();
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "jiti/register",
        join(__dirname, "../scripts/copy-demo.ts"),
        join(dir, "nope.txt"),
        join(dir, "out.txt"),
      ],
      { encoding: "utf8", cwd: join(__dirname, "..") },
    );
    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("missing");
  });

  it("exits zero and copies when run with a real source", () => {
    const dir = temp();
    const src = join(dir, "s.txt");
    writeFileSync(src, "hello");
    const dest = join(dir, "pub", "d.txt");
    const run = spawnSync(
      process.execPath,
      ["--import", "jiti/register", join(__dirname, "../scripts/copy-demo.ts"), src, dest],
      { encoding: "utf8", cwd: join(__dirname, "..") },
    );
    expect(run.status).toBe(0);
    expect(readFileSync(dest, "utf8")).toBe("hello");
  });
});
