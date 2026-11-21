import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVENANCE_ROOT, REPO_ROOT } from "../support/scan.js";

/** The commit this spec started from (design, "Baseline of the repository"). */
const BASE = "d563a75";
/**
 * The last commit of this spec. Later specs (recorded-sample) change apps/web on purpose, so the
 * boundary of this spec is checked over its own range, not against the working tree.
 */
const END = "d2c8811";

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function hasBase(): boolean {
  try {
    git("cat-file", "-e", `${BASE}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

const BASE_PRESENT = hasBase();
const withBase = it.skipIf(!BASE_PRESENT);

/** Paths under `paths` that differ from the base commit: committed, staged, unstaged or untracked. */
function changed(...paths: string[]): string[] {
  const diff = git("diff", "--name-only", BASE, "--", ...paths).split("\n");
  const fresh = git("ls-files", "--others", "--exclude-standard", "--", ...paths).split("\n");
  return [...new Set([...diff, ...fresh])].filter((p) => p !== "").sort();
}

/** Paths under `paths` that this spec's own commits changed, from BASE to END. */
function changedBySpec(...paths: string[]): string[] {
  const diff = git("diff", "--name-only", BASE, END, "--", ...paths).split("\n");
  return diff.filter((p) => p !== "").sort();
}
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

/** Every file under `dir`, with its path relative to `dir`. */
function listFiles(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(dir, `${prefix}${e.name}/`) : [`${prefix}${e.name}`],
  );
}

/**
 * True when `file` is the Record of a tracked file whose own text holds `key` (Kiro writes its chat
 * session id into `tasks.meta.json`): the Record then repeats content, it does not leak a key.
 */
function isContent(file: string, key: string): boolean {
  const match = /^records\/(.+)\.reveal$/.exec(file);
  const source = match?.[1] === undefined ? null : join(REPO_ROOT, match[1]);
  return source !== null && existsSync(source) && readFileSync(source, "utf8").includes(key);
}

describe("repository boundaries _Requirements: 1.2, 1.3, 1.4, 1.10, 1.11, 3.25_", () => {
  it("the base commit is present (a shallow clone cannot run the diff checks)", () => {
    expect(BASE_PRESENT, `git history lacks ${BASE}; fetch full history`).toBe(true);
  });

  withBase("no file changed under apps/web, packages/verifier or packages/engine/src", () => {
    expect(changedBySpec("apps/web", "packages/verifier", "packages/engine/src")).toEqual([]);
  });

  withBase("no file changed under data, scripts/commit-task.sh or pnpm-workspace.yaml", () => {
    expect(changed("data", "scripts/commit-task.sh", "pnpm-workspace.yaml")).toEqual([]);
  });

  withBase("under packages/export and crew/sentinel only the two test edits changed", () => {
    expect(changed("packages/export", "crew/sentinel")).toEqual([
      "crew/sentinel/test/static/package.test.ts",
      "packages/export/test/package.test.ts",
    ]);
  });

  withBase("the root package.json changed only by the script reveal", () => {
    const base = JSON.parse(git("show", `${BASE}:package.json`)) as Record<string, unknown>;
    const now = readJson(join(REPO_ROOT, "package.json"));
    const { scripts: nowScripts, ...nowRest } = now;
    const { scripts: baseScripts, ...baseRest } = base;
    expect(nowRest).toEqual(baseRest);
    const added = Object.keys(nowScripts as object).filter(
      (k) => !Object.hasOwn(baseScripts as object, k),
    );
    expect(added).toEqual(["reveal"]);
    const kept = Object.fromEntries(
      Object.entries(nowScripts as Record<string, string>).filter(([k]) => k !== "reveal"),
    );
    expect(kept).toEqual(baseScripts);
  });

  it("dependencies of the package are exactly the Engine, the SDK and zod", () => {
    const pkg = readJson(join(PROVENANCE_ROOT, "package.json"));
    expect(Object.keys(pkg["dependencies"] as object).sort()).toEqual([
      "@modelcontextprotocol/sdk",
      "@reveal-codes/engine",
      "zod",
    ]);
  });

  it("the SDK and zod are pinned to the versions of packages/courtlistener-mcp", () => {
    const own = readJson(join(PROVENANCE_ROOT, "package.json"))["dependencies"] as Record<
      string,
      string
    >;
    const mcp = readJson(join(REPO_ROOT, "packages", "courtlistener-mcp", "package.json"))[
      "dependencies"
    ] as Record<string, string>;
    expect(own["@modelcontextprotocol/sdk"]).toBe(mcp["@modelcontextprotocol/sdk"]);
    expect(own["zod"]).toBe(mcp["zod"]);
  });

  it("the Engine's package.json still has zero runtime dependencies", () => {
    const engine = readJson(join(REPO_ROOT, "packages", "engine", "package.json"));
    expect(Object.keys((engine["dependencies"] as object | undefined) ?? {})).toEqual([]);
  });

  it("vitest.config.ts holds one project named provenance", () => {
    const text = readFileSync(join(REPO_ROOT, "vitest.config.ts"), "utf8");
    expect(text.match(/project\(\s*"provenance"/g)).toHaveLength(1);
    expect(text.match(/name:\s*"provenance"/g) ?? []).toHaveLength(0);
  });

  // state.json is not committed; a clean clone has no Session_Key to look for.
  const DIR = join(REPO_ROOT, ".kiro", "provenance");
  it.skipIf(!existsSync(join(DIR, "state.json")))(
    "no file of the Record_Directory format holds a Session_Key outside state.json",
    () => {
      const dir = DIR;
      const statePath = join(dir, "state.json");
      const state = readJson(statePath);
      const keys = Object.keys((state["sessions"] as Record<string, unknown> | undefined) ?? {});
      const others = listFiles(dir).filter((f) => f !== "state.json");
      const leaks = others.filter((f) => {
        const text = readFileSync(join(dir, f), "latin1");
        return keys.some((k) => k !== "_none" && k !== "" && text.includes(k) && !isContent(f, k));
      });
      expect(leaks).toEqual([]);
    },
  );
});
