import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hookFileText } from "../src/core/hook-file.js";
import { setupProvenanceOutput } from "../src/mcp/schemas.js";
import { NEEDS_WORKSPACE_MESSAGE } from "../src/mcp/workspace.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const PROV = ".kiro/provenance";
const scratch: string[] = [];
const dirs: TempDir[] = [];
let bundle = "";
useIsolatedGit();

/** Builds the Bundle into a temp dir and copies the one file to another, with no node_modules. */
function buildBundle(): string {
  const out = mkdtempSync(join(tmpdir(), "reveal-bundle-build-"));
  const lone = mkdtempSync(join(tmpdir(), "reveal-bundle-lone-"));
  scratch.push(out, lone);
  const built = spawnSync(
    process.execPath,
    ["scripts/build-power.mjs", "--power", "provenance", out],
    { cwd: REPO, encoding: "utf8" },
  );
  expect(built.status, built.stderr).toBe(0);
  mkdirSync(lone, { recursive: true });
  copyFileSync(join(out, "server", "provenance.mjs"), join(lone, "provenance.mjs"));
  return join(lone, "provenance.mjs");
}

async function connect(cwd: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundle, "mcp"],
    cwd,
    stderr: "pipe",
  });
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

function tempWorkspace(git: boolean): TempDir {
  const d = makeTempDir();
  dirs.push(d);
  if (git) d.git("init", "-q");
  d.write("a.txt", "alpha\n");
  return d;
}

beforeAll(() => {
  bundle = buildBundle();
}, 120_000);

afterAll(() => {
  for (const d of dirs) d.cleanup();
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

describe(
  "setup_provenance over stdio from the built Bundle _Requirements: 12.9, 12.12, 12.14, 13.3, 13.4_",
  {
    timeout: 60_000,
  },
  () => {
    it("writes the files, returns the three lists, and keeps everything on a second call", async () => {
      const d = tempWorkspace(true);
      const client = await connect(d.root);
      const first = await client.callTool({
        name: "setup_provenance",
        arguments: { workspace: d.root },
      });
      const one = setupProvenanceOutput.parse(first.structuredContent);
      expect(first.isError).not.toBe(true);
      expect(one.written).toEqual(
        expect.arrayContaining([
          `${PROV}/provenance.mjs`,
          `${PROV}/reveal`,
          `${PROV}/.gitignore`,
          `${PROV}/ignore`,
          `${PROV}/baseline.json`,
          `${PROV}/sessions.json`,
          ".kiro/hooks/0-provenance.json",
        ]),
      );
      expect(one.replaced).toEqual([]);
      expect(one.kept).toEqual([]);
      for (const path of one.written) expect(existsSync(`${d.root}/${path}`)).toBe(true);
      expect(readFileSync(`${d.root}/.kiro/hooks/0-provenance.json`, "utf8")).toBe(hookFileText());
      expect(readFileSync(`${d.root}/${PROV}/provenance.mjs`)).toEqual(readFileSync(bundle));
      expect(existsSync(`${d.root}/.kiroignore`)).toBe(false);
      expect(existsSync(`${d.root}/.git/hooks/pre-commit`)).toBe(false);
      const second = await client.callTool({
        name: "setup_provenance",
        arguments: { workspace: d.root },
      });
      const two = setupProvenanceOutput.parse(second.structuredContent);
      expect(two.written).toEqual([]);
      expect(two.replaced).toEqual([]);
      expect([...two.kept].sort()).toEqual([...one.written].sort());
      await client.close();
    });

    it("writes the pre-commit block only when gitHook is true", async () => {
      const d = tempWorkspace(true);
      const client = await connect(d.root);
      await client.callTool({
        name: "setup_provenance",
        arguments: { workspace: d.root, gitHook: true },
      });
      expect(readFileSync(`${d.root}/.git/hooks/pre-commit`, "utf8")).toContain("reveal");
      await client.close();
    });

    it("uses the current directory when it holds .git, and refuses one that holds neither .git nor .kiro", async () => {
      const withGit = tempWorkspace(true);
      const client = await connect(withGit.root);
      const ok = await client.callTool({ name: "setup_provenance", arguments: {} });
      expect(ok.isError).not.toBe(true);
      expect(existsSync(`${withGit.root}/${PROV}/provenance.mjs`)).toBe(true);
      await client.close();
      const bare = tempWorkspace(false);
      const bareClient = await connect(bare.root);
      const refused = await bareClient.callTool({ name: "setup_provenance", arguments: {} });
      const text = (refused.content as { text: string }[]).map((c) => c.text).join("\n");
      expect(refused.isError).toBe(true);
      expect(text).toBe(NEEDS_WORKSPACE_MESSAGE);
      expect(existsSync(`${bare.root}/.kiro`)).toBe(false);
      await bareClient.close();
    });

    it("lists five tools and leaves readOnlyHint off setup_provenance only", async () => {
      const d = tempWorkspace(false);
      const client = await connect(d.root);
      const { tools } = await client.listTools();
      const setup = tools.find((t) => t.name === "setup_provenance");
      expect(tools).toHaveLength(5);
      expect(setup?.annotations?.readOnlyHint).not.toBe(true);
      expect(setup?.outputSchema).toBeDefined();
      for (const tool of tools.filter((t) => t.name !== "setup_provenance")) {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
      await client.close();
    });
  },
);
