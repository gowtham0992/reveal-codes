import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  checkRecordsOutput,
  provenanceSummaryOutput,
  revealFileOutput,
  setupProvenanceOutput,
  untouchedAgentTextOutput,
} from "../src/mcp/schemas.js";
import { makeTempDir, useIsolatedGit } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";

/** Req 13.10, 13.11, 16.11: the Power works from a copy with no node_modules and no repository. */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PROV = ".kiro/provenance";
const scratch: string[] = [];
const dirs: TempDir[] = [];
let copy = "";
useIsolatedGit();

function record(v: unknown): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("expected object");
  return Object.fromEntries(Object.entries(v));
}

/** The command and arguments of `mcp.json` in the copy, with `${PLUGIN_ROOT}` replaced. */
function serverCommand(): { command: string; args: string[] } {
  const mcp = record(JSON.parse(readFileSync(join(copy, "mcp.json"), "utf8")));
  const server = record(record(mcp["mcpServers"])["provenance"]);
  const args = server["args"];
  const command = server["command"];
  if (typeof command !== "string" || !Array.isArray(args)) throw new Error("bad mcp.json");
  return {
    command,
    args: args.map((a) => String(a).replaceAll("${PLUGIN_ROOT}", copy)),
  };
}

async function connect(): Promise<Client> {
  const { command, args } = serverCommand();
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "" };
  const transport = new StdioClientTransport({ command, args, cwd: copy, env, stderr: "pipe" });
  const client = new Client({ name: "power-tools-test", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

function workspace(): TempDir {
  const d = makeTempDir();
  dirs.push(d);
  d.git("init", "-q");
  d.write("a.txt", "alpha\nbeta\n");
  return d;
}

beforeAll(() => {
  copy = realpathSync(mkdtempSync(join(tmpdir(), "provenance-power-copy-")));
  scratch.push(copy);
  cpSync(join(ROOT, "powers", "provenance"), copy, { recursive: true });
});
afterAll(() => {
  for (const d of dirs) d.cleanup();
  for (const path of scratch) rmSync(path, { recursive: true, force: true });
});

describe("Provenance Power from a copy outside the repository _Requirements: 13.10, 13.11, 16.11_", () => {
  it("the copy is outside the repository and holds no node_modules", () => {
    expect(relative(ROOT, copy).startsWith("..")).toBe(true);
    expect(copy.split(sep)).not.toContain("node_modules");
    const entries = readdirSync(copy, { recursive: true });
    expect(entries.map(String).filter((e) => e.split(sep).includes("node_modules"))).toEqual([]);
    expect(existsSync(join(copy, "server", "provenance.mjs"))).toBe(true);
  });

  it("lists the five tools and each returns its Requirement 12 shape", async () => {
    const d = workspace();
    const client = await connect();
    try {
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(names).toEqual([
        "check_records",
        "provenance_summary",
        "reveal_file",
        "setup_provenance",
        "untouched_agent_text",
      ]);

      const setup = await client.callTool({
        name: "setup_provenance",
        arguments: { workspace: d.root },
      });
      expect(setup.isError).not.toBe(true);
      const done = setupProvenanceOutput.parse(setup.structuredContent);
      expect(done.written).toEqual(
        expect.arrayContaining([`${PROV}/provenance.mjs`, ".kiro/hooks/0-provenance.json"]),
      );
      const installed = readFileSync(join(d.root, PROV, "provenance.mjs"));
      expect(installed.equals(readFileSync(join(copy, "server", "provenance.mjs")))).toBe(true);

      const reveal = await client.callTool({
        name: "reveal_file",
        arguments: { path: "a.txt", workspace: d.root },
      });
      const file = revealFileOutput.parse(reveal.structuredContent);
      expect(file.file).toBe("a.txt");
      expect(file.status).toBe("unchanged_baseline");
      expect(file.legend).toHaveLength(4);

      const untouched = await client.callTool({
        name: "untouched_agent_text",
        arguments: { path: "a.txt", workspace: d.root },
      });
      const text = untouchedAgentTextOutput.parse(untouched.structuredContent);
      expect(text.path).toBe("a.txt");
      expect(text.stretches).toEqual([]);
      expect(text.countsByOrigin.AI).toBe(0);
      expect(text.notice).toContain("changed while no agent window was open");

      const summary = await client.callTool({
        name: "provenance_summary",
        arguments: { workspace: d.root },
      });
      const sum = provenanceSummaryOutput.parse(summary.structuredContent);
      expect(sum.total.characters.AI).toBe(0);
      expect(sum.total.characters.PST).toBeGreaterThan(0);

      const check = await client.callTool({
        name: "check_records",
        arguments: { workspace: d.root },
      });
      const checked = checkRecordsOutput.parse(check.structuredContent);
      expect(checked.ok).toBe(true);
      expect(checked.failures).toEqual([]);
      expect(checked.filesChecked).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("`setup` run from the copy writes the same files into a temporary workspace", () => {
    const d = workspace();
    const run = spawnSync(process.execPath, [join(copy, "server", "provenance.mjs"), "setup"], {
      cwd: d.root,
      encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
    const installed = readFileSync(join(d.root, PROV, "provenance.mjs"));
    expect(installed.equals(readFileSync(join(copy, "server", "provenance.mjs")))).toBe(true);
    expect(existsSync(join(d.root, ".kiro", "hooks", "0-provenance.json"))).toBe(true);
  }, 60_000);
});
