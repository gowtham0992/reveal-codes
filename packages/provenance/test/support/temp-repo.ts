import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, vi } from "vitest";

/** A temporary directory with real files; removed by `cleanup`. A local process, no network. */
export type TempDir = {
  root: string;
  write: (path: string, data: string | Uint8Array) => void;
  link: (target: string, path: string) => void;
  git: (...args: string[]) => string;
  cleanup: () => void;
};

/**
 * Makes `git` ignore the user's and the system's configuration for the calls of one test file
 * (the Recorder's `execFile` inherits `process.env`), as `git-ignore.ts` does.
 */
export function useIsolatedGit(): void {
  const home = mkdtempSync(join(tmpdir(), "reveal-git-home-"));
  beforeAll(() => {
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", join(home, "xdg"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("GIT_TERMINAL_PROMPT", "0");
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });
}

export function makeTempDir(): TempDir {
  const root = mkdtempSync(join(tmpdir(), "reveal-scan-"));
  return {
    root,
    write: (path, data) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), data);
    },
    link: (target, path) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      symlinkSync(target, join(root, path));
    },
    git: (...args) => {
      const result = spawnSync("git", ["-c", "core.autocrlf=false", ...args], {
        cwd: root,
        encoding: "utf8",
      });
      if (result.error !== undefined) throw result.error;
      if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
      return result.stdout;
    },
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
