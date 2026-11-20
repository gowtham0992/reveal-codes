import { afterEach, describe, expect, it } from "vitest";
import { nodeDeps } from "../src/io/deps.js";
import {
  NEEDS_WORKSPACE_MESSAGE,
  NOT_SET_UP_MESSAGE,
  resolveInside,
  resolveSetupRoot,
  resolveWorkspace,
} from "../src/mcp/workspace.js";
import { makeTempDir } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";

let dir: TempDir | null = null;
afterEach(() => {
  dir?.cleanup();
  dir = null;
});
function fresh(): TempDir {
  dir = makeTempDir();
  dir.write(".kiro/provenance/ignore", "# none\n");
  dir.write("src/deep/a.ts", "x\n");
  return dir;
}
const deps = nodeDeps();

describe("resolveWorkspace", () => {
  it("walks up from a subdirectory to the nearest Record_Directory", async () => {
    const d = fresh();
    const found = await resolveWorkspace(deps, `${d.root}/src/deep`, undefined);
    expect(found).toEqual({ ok: true, value: d.root });
  });

  it("starts from the workspace argument instead of the current directory", async () => {
    const d = fresh();
    const other = makeTempDir();
    try {
      const found = await resolveWorkspace(deps, other.root, `${d.root}/src`);
      expect(found).toEqual({ ok: true, value: d.root });
    } finally {
      other.cleanup();
    }
  });

  it("gives the error that names setup_provenance when no Record_Directory is found", async () => {
    dir = makeTempDir();
    const found = await resolveWorkspace(deps, dir.root, dir.root);
    expect(found).toEqual({ ok: false, error: { message: NOT_SET_UP_MESSAGE } });
    expect(NOT_SET_UP_MESSAGE).toContain("not set up");
    expect(NOT_SET_UP_MESSAGE).toContain("setup_provenance");
  });

  it("rejects a relative workspace argument", async () => {
    const d = fresh();
    const found = await resolveWorkspace(deps, d.root, "src");
    expect(found.ok).toBe(false);
  });
});

describe("resolveInside", () => {
  it("resolves a relative and an absolute path inside the root", () => {
    expect(resolveInside("/ws", "src/a.ts")).toEqual({ ok: true, value: "src/a.ts" });
    expect(resolveInside("/ws", "/ws/src/../src/a.ts")).toEqual({ ok: true, value: "src/a.ts" });
    expect(resolveInside("/ws", ".")).toEqual({ ok: true, value: "" });
  });

  it("rejects a path that leaves the root with .. and an absolute path outside it", () => {
    expect(resolveInside("/ws", "../other/a.ts").ok).toBe(false);
    expect(resolveInside("/ws", "src/../../a.ts").ok).toBe(false);
    expect(resolveInside("/ws", "/etc/passwd").ok).toBe(false);
    expect(resolveInside("/ws", "/ws-sibling/a.ts").ok).toBe(false);
  });
});

describe("resolveSetupRoot", () => {
  it("uses the workspace argument, or the current directory only when it holds .git or .kiro", async () => {
    const d = fresh();
    expect(await resolveSetupRoot(deps, "/nowhere", d.root)).toEqual({ ok: true, value: d.root });
    expect(await resolveSetupRoot(deps, d.root, undefined)).toEqual({ ok: true, value: d.root });
    const bare = makeTempDir();
    try {
      const refused = await resolveSetupRoot(deps, bare.root, undefined);
      expect(refused).toEqual({ ok: false, error: { message: NEEDS_WORKSPACE_MESSAGE } });
    } finally {
      bare.cleanup();
    }
  });
});
