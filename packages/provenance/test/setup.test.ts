import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { gitHookBlock } from "../src/core/git-hook.js";
import { hookFileText } from "../src/core/hook-file.js";
import { wrapperText } from "../src/core/wrapper.js";
import { nodeDeps } from "../src/io/deps.js";
import { setupProvenance } from "../src/io/setup.js";
import type { SetupReport } from "../src/io/setup.js";
import { formatSetupReport, parseSetupArgs, setupCommand } from "../src/io/setup-cmd.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";
const deps = nodeDeps();
const PROV = ".kiro/provenance";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
let dir: TempDir | null = null;
const extra: string[] = [];
afterEach(() => {
  dir?.cleanup();
  for (const path of extra.splice(0)) rmSync(path, { recursive: true, force: true });
});
useIsolatedGit();
/** A workspace holding one text file and a stand-in "Bundle" (a .mjs file with known bytes). */
function workspace(git: boolean): TempDir {
  dir = makeTempDir();
  if (git) dir.git("init", "-q");
  dir.write("a.txt", "alpha\n");
  const src = mkdtempSync(join(tmpdir(), "reveal-bundle-src-"));
  extra.push(src);
  writeFileSync(join(src, "provenance.mjs"), "// bundle one\n");
  bundles.set(dir.root, join(src, "provenance.mjs"));
  return dir;
}
const bundles = new Map<string, string>();
const bundle = (d: TempDir): string => bundles.get(d.root) ?? "";
const read = (d: TempDir, p: string): string => readFileSync(`${d.root}/${p}`, "utf8");
async function run(d: TempDir, gitHook = false): Promise<SetupReport> {
  const done = await setupProvenance(deps, d.root, bundle(d), gitHook);
  if (!done.ok) throw new Error(`setup failed: ${done.error.kind} ${done.error.detail ?? ""}`);
  return done.value;
}
const withoutCache = (paths: string[]): string[] =>
  paths.filter((p) => !p.startsWith(`${PROV}/cache/`));
const FILES = [
  `${PROV}/provenance.mjs`,
  `${PROV}/reveal`,
  `${PROV}/.gitignore`,
  `${PROV}/ignore`,
  ".kiro/hooks/0-provenance.json",
];
describe.each([true, false])("provenance setup (git: %s)", (git) => {
  it("a fresh run writes every file in order, no Record, and leaves .kiroignore absent", async () => {
    const d = workspace(git);
    const report = await run(d);
    expect(withoutCache(report.written)).toEqual([
      ...FILES,
      `${PROV}/baseline.json`,
      `${PROV}/sessions.json`,
    ]);
    expect(report.replaced).toEqual([]);
    expect(report.kept).toEqual([]);
    // a.txt and the Hook_File that setup has just written are both text files without a Record.
    expect(report.baseline).toEqual({ added: 2, skipped: 0 });
    expect(report.written.filter((p) => p.startsWith(`${PROV}/cache/`)).length).toBeLessThanOrEqual(
      2,
    );
    expect(read(d, `${PROV}/provenance.mjs`)).toBe("// bundle one\n");
    expect(read(d, `${PROV}/reveal`)).toBe(wrapperText());
    expect(statSync(`${d.root}/${PROV}/reveal`).mode & 0o111).toBe(0o111);
    expect(read(d, `${PROV}/.gitignore`)).toBe("state.json\nerrors.log\nlock\ncache/\n");
    expect(read(d, ".kiro/hooks/0-provenance.json")).toBe(hookFileText());
    expect(
      read(d, `${PROV}/ignore`)
        .split("\n")
        .filter((l) => l !== ""),
    ).toSatisfy((lines: string[]) => lines.every((l) => l.startsWith("#")));
    expect(existsSync(`${d.root}/${PROV}/records`)).toBe(false);
    expect(existsSync(`${d.root}/.kiroignore`)).toBe(false);
    expect(JSON.parse(read(d, `${PROV}/sessions.json`))).toMatchObject({
      noPromptEventSessions: 0,
    });
  });
  it("a second run keeps every file and replaces nothing", async () => {
    const d = workspace(git);
    const first = await run(d);
    const second = await run(d);
    expect(second.written).toEqual([]);
    expect(second.replaced).toEqual([]);
    expect(withoutCache(second.kept)).toEqual([
      ...FILES,
      `${PROV}/baseline.json`,
      `${PROV}/sessions.json`,
    ]);
    expect(second.kept.filter((p) => p.startsWith(`${PROV}/cache/`))).toEqual(
      first.written.filter((p) => p.startsWith(`${PROV}/cache/`)),
    );
  });
  it("a changed Bundle is replaced and reported; the wrapper with equal bytes is kept", async () => {
    const d = workspace(git);
    await run(d);
    writeFileSync(bundle(d), "// bundle two\n");
    const report = await run(d);
    expect(report.replaced).toEqual([`${PROV}/provenance.mjs`]);
    expect(report.kept).toContain(`${PROV}/reveal`);
    expect(read(d, `${PROV}/provenance.mjs`)).toBe("// bundle two\n");
  });
  it("a changed wrapper is replaced and made executable again", async () => {
    const d = workspace(git);
    await run(d);
    writeFileSync(`${d.root}/${PROV}/reveal`, "#!/bin/sh\necho old\n");
    chmodSync(`${d.root}/${PROV}/reveal`, 0o644);
    const report = await run(d);
    expect(report.replaced).toEqual([`${PROV}/reveal`]);
    expect(read(d, `${PROV}/reveal`)).toBe(wrapperText());
    expect(statSync(`${d.root}/${PROV}/reveal`).mode & 0o111).toBe(0o111);
  });
  it("never overwrites an edited Hook_File, Ignore_File, .gitignore, baseline, sessions or cache file", async () => {
    const d = workspace(git);
    const first = await run(d);
    const edits: [string, string][] = [
      [".kiro/hooks/0-provenance.json", '{ "edited": true }\n'],
      [`${PROV}/ignore`, "# mine\nbuild-x/\n"],
      [`${PROV}/.gitignore`, "state.json\n"],
      [`${PROV}/sessions.json`, read(d, `${PROV}/sessions.json`).replace("0", "4")],
    ];
    const cached = first.written.filter((p) => p.startsWith(`${PROV}/cache/`));
    const cacheBytes = cached.map((p) => read(d, p));
    for (const [path, text] of edits) d.write(path, text);
    const baseline = read(d, `${PROV}/baseline.json`);
    const report = await run(d);
    expect(report.written).toEqual([]);
    expect(report.replaced).toEqual([]);
    for (const [path, text] of edits) {
      expect(read(d, path)).toBe(text);
      expect(report.kept).toContain(path);
    }
    expect(read(d, `${PROV}/baseline.json`)).toBe(baseline);
    expect(read(d, `${PROV}/sessions.json`)).toContain("4");
    expect(cached.length).toBeGreaterThan(0);
    expect(cached.map((p) => read(d, p))).toEqual(cacheBytes);
    for (const p of cached) expect(report.kept).toContain(p);
  });
  it("leaves an existing .kiroignore byte for byte unchanged", async () => {
    const d = workspace(git);
    d.write(".kiroignore", "secret/\n# no newline");
    await run(d);
    await run(d);
    expect(read(d, ".kiroignore")).toBe("secret/\n# no newline");
  });
  it("creates no Record for an existing Record's file and keeps the Record", async () => {
    const d = workspace(git);
    d.write(`${PROV}/records/a.txt.reveal`, "record bytes");
    const report = await run(d);
    expect(read(d, `${PROV}/records/a.txt.reveal`)).toBe("record bytes");
    expect(report.baseline.added).toBe(1);
    expect(read(d, `${PROV}/baseline.json`)).not.toContain("a.txt");
  });
});
describe("provenance setup --git-hook", () => {
  const hookPath = (d: TempDir): string => `${d.root}/.git/hooks/pre-commit`;
  it("creates an executable pre-commit with the block, and a second run keeps it", async () => {
    const d = workspace(true);
    expect((await run(d, true)).gitHook).toEqual({ status: "written" });
    expect(readFileSync(hookPath(d), "utf8")).toBe(`#!/bin/sh\n${gitHookBlock()}`);
    expect(statSync(hookPath(d)).mode & 0o111).toBe(0o111);
    expect((await run(d, true)).gitHook).toEqual({ status: "kept" });
  });
  it("appends to an existing hook and keeps its earlier bytes", async () => {
    const d = workspace(true);
    mkdirSync(`${d.root}/.git/hooks`, { recursive: true });
    writeFileSync(hookPath(d), "#!/bin/sh\necho mine\n");
    expect((await run(d, true)).gitHook).toEqual({ status: "appended" });
    expect(readFileSync(hookPath(d), "utf8")).toBe(`#!/bin/sh\necho mine\n${gitHookBlock()}`);
  });
  it("reports an existing hook with an unconditional exit and leaves it unchanged", async () => {
    const d = workspace(true);
    mkdirSync(`${d.root}/.git/hooks`, { recursive: true });
    writeFileSync(hookPath(d), "#!/bin/sh\necho mine\nexit 0\n");
    const report = await run(d, true);
    expect(report.gitHook).toEqual({ status: "blocked", reason: "unconditional_exit" });
    expect(readFileSync(hookPath(d), "utf8")).toBe("#!/bin/sh\necho mine\nexit 0\n");
    expect(formatSetupReport(report).join("\n")).toContain("unconditional_exit");
  });
  it("writes no pre-commit hook without the flag", async () => {
    const d = workspace(true);
    const report = await run(d);
    expect(report.gitHook).toBeUndefined();
    expect(existsSync(hookPath(d))).toBe(false);
  });
  it("in a directory with no .git it fails before writing anything", async () => {
    const d = workspace(false);
    const done = await setupProvenance(deps, d.root, bundle(d), true);
    expect(done).toMatchObject({ ok: false, error: { detail: "no_git_directory" } });
    expect(existsSync(`${d.root}/.kiro`)).toBe(false);
    expect(existsSync(`${d.root}/.git`)).toBe(false);
  });
});
describe("setup arguments and printing", () => {
  it("accepts no argument or --git-hook only", () => {
    expect(parseSetupArgs([])).toEqual({ gitHook: false });
    expect(parseSetupArgs(["--git-hook"])).toEqual({ gitHook: true });
    expect(parseSetupArgs(["--git"])).toBeNull();
    expect(parseSetupArgs(["--git-hook", "x"])).toBeNull();
  });
  it("refuses to run from source, where no Bundle exists to copy", async () => {
    const d = workspace(false);
    const done = await setupProvenance(deps, d.root, `${d.root}/src/main.ts`, false);
    expect(done).toMatchObject({ ok: false, error: { detail: "not_running_from_bundle" } });
    expect(existsSync(`${d.root}/.kiro`)).toBe(false);
  });
  it("prints the three lists and the baseline line, and exits 1 on a bad flag", async () => {
    const d = workspace(false);
    const out: string[] = [];
    const errs: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => errs.push(l) };
    expect(await setupCommand(deps, d.root, bundle(d), [], io)).toBe(0);
    expect(out[0]).toBe("written:");
    expect(out).toContain("replaced: none");
    expect(out).toContain("kept: none");
    expect(out).toContain("baseline: 2 added, 0 skipped");
    expect(await setupCommand(deps, d.root, bundle(d), ["--x"], io)).toBe(1);
    expect(errs).toEqual(["usage: provenance setup [--git-hook]"]);
  });
});
describe("the built Bundle, outside the repository with no node_modules", () => {
  it("copies itself, and a second run from the installed copy keeps everything", () => {
    const out = mkdtempSync(join(tmpdir(), "reveal-bundle-"));
    extra.push(out);
    const built = spawnSync("node", ["scripts/build-power.mjs", "--power", "provenance", out], {
      cwd: REPO,
      encoding: "utf8",
    });
    expect(built.status).toBe(0);
    const outside = join(out, "server", "provenance.mjs");
    const d = makeTempDir();
    dir = d;
    d.write("a.txt", "alpha\n");
    const first = spawnSync("node", [outside, "setup"], { cwd: d.root, encoding: "utf8" });
    expect(first.stderr).toBe("");
    expect(first.status).toBe(0);
    expect(first.stdout).toContain(`  ${PROV}/provenance.mjs\n`);
    expect(first.stdout).toContain("replaced: none\nkept: none\nbaseline: 2 added, 0 skipped\n");
    expect(readFileSync(`${d.root}/${PROV}/provenance.mjs`)).toEqual(readFileSync(outside));
    const second = spawnSync("node", [`${d.root}/${PROV}/provenance.mjs`, "setup"], {
      cwd: d.root,
      encoding: "utf8",
    });
    expect(second.status).toBe(0);
    expect(second.stdout.startsWith("written: none\nreplaced: none\nkept:\n")).toBe(true);
    const wrapped = spawnSync(`${d.root}/${PROV}/reveal`, ["--check"], {
      cwd: d.root,
      encoding: "utf8",
    });
    expect(wrapped.status).toBe(0);
  }, 60_000);
});
