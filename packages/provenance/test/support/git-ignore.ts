import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Whether a local `git` runs (`git --version` exits 0). */
export function gitAvailable(): boolean {
  const result = spawnSync("git", ["--version"], { encoding: "utf8" });
  return result.error === undefined && result.status === 0;
}

function gitEnv(home: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env["PATH"],
    HOME: home,
    XDG_CONFIG_HOME: join(home, "xdg"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
}

function runGit(cwd: string, home: string, args: readonly string[], input?: string) {
  const result = spawnSync("git", ["-c", "core.ignorecase=false", ...args], {
    cwd,
    env: gitEnv(home),
    input,
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

/**
 * The paths that `git check-ignore --no-index` reports as ignored, for a repository whose root
 * `.gitignore` holds `contents` and in which every path exists as a file. One temporary
 * directory per call, removed afterwards; a local process, no network.
 */
export function gitIgnoredPaths(contents: string, paths: readonly string[]): Set<string> {
  const root = mkdtempSync(join(tmpdir(), "reveal-ignore-"));
  try {
    const repo = join(root, "repo");
    mkdirSync(repo);
    const init = runGit(repo, root, ["init", "-q", "--template="]);
    if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
    writeFileSync(join(repo, ".gitignore"), contents);
    for (const path of paths) {
      const file = join(repo, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, "");
    }
    const check = runGit(
      repo,
      root,
      ["check-ignore", "--no-index", "-z", "--stdin"],
      paths.map((p) => `${p}\0`).join(""),
    );
    if (check.status === 1) return new Set();
    if (check.status !== 0) throw new Error(`git check-ignore failed: ${check.stderr}`);
    return new Set(check.stdout.split("\0").filter((p) => p !== ""));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
