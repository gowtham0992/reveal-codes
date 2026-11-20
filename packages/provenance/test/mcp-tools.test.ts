import { spawnSync } from "node:child_process";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createDocument, renderRecord } from "@reveal-codes/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { humNotice, noPromptSessionsLine } from "../src/core/legend.js";
import { updateRecord } from "../src/core/update.js";
import { baselineCommand } from "../src/io/baseline-cmd.js";
import { nodeDeps } from "../src/io/deps.js";
import {
  checkRecordsOutput,
  provenanceSummaryOutput,
  revealFileOutput,
  untouchedAgentTextOutput,
} from "../src/mcp/schemas.js";
import { NOT_SET_UP_MESSAGE } from "../src/mcp/workspace.js";
import { fixedClock } from "./support/clock.js";
import { makeTempDir } from "./support/temp-repo.js";
import type { TempDir } from "./support/temp-repo.js";
const ENTRY = new URL("../src/cli/main.ts", import.meta.url).pathname;
const JITI = import.meta.resolve("jiti/register");
const PROV = ".kiro/provenance";
const WINDOW = { windowRun: "5.3 Build the view 2026-11-19T10:01:00Z" };
const clock = fixedClock();
const dirs: TempDir[] = [];
let client: Client;
function workspace(): TempDir {
  const d = makeTempDir();
  dirs.push(d);
  d.write(`${PROV}/ignore`, "# none\n");
  return d;
}
function baseline(d: TempDir): Promise<number> {
  return baselineCommand(nodeDeps(), d.root, () => undefined);
}
function write(d: TempDir, path: string, doc: ReturnType<typeof createDocument>): void {
  if (!doc.ok) throw new Error("createDocument failed");
  d.write(`${PROV}/records/${path}.reveal`, renderRecord(doc.value, null, "full").text);
}
/** A Record: `base`, then the agent's `agent` text in a window, then an outside edit to `human`. */
function agentRecord(d: TempDir, path: string, base: string, agent: string, human: string): void {
  const made = createDocument(base, "2026-11-19T10:00:00.000Z");
  if (!made.ok) throw new Error("createDocument failed");
  const edit = (doc: typeof made.value, text: string, origin: "AI" | "HUM") => {
    const next = updateRecord(doc, text, origin, origin === "AI" ? WINDOW : null, clock);
    if (!next.ok) throw new Error(next.error.kind);
    return next.value;
  };
  const final = edit(edit(made.value, agent, "AI"), human, "HUM");
  write(d, path, { ok: true, value: final });
}
/** Every file under the workspace with its mtime and size. */
function snapshot(d: TempDir): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(`${d.root}/${rel}`, { withFileTypes: true })) {
      const path = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(path);
      else {
        const s = statSync(`${d.root}/${path}`);
        out.push(`${path} ${String(s.mtimeMs)} ${String(s.size)}`);
      }
    }
  };
  walk("");
  return out.sort();
}
function reveal(d: TempDir, args: string[]): { status: number | null; stdout: string } {
  const ran = spawnSync(process.execPath, ["--import", JITI, ENTRY, "reveal", ...args], {
    cwd: d.root,
    encoding: "utf8",
    timeout: 30_000,
    env: { PATH: process.env["PATH"] ?? "" },
  });
  return { status: ran.status, stdout: ran.stdout };
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
  return { result, text, data: result.structuredContent, isError: result.isError === true };
}
/** The main workspace: an Unchanged_File, a current Record with AI text, and a stale Record. */
let main: TempDir;
beforeAll(async () => {
  main = workspace();
  main.write("README.md", "hello\n");
  await baseline(main);
  agentRecord(main, "src/a.ts", "one\n", "one\ntwo\nthree\n", "one\ntwo\nthree\nfour\n");
  main.write("src/a.ts", "one\ntwo\nthree\nfour\n");
  agentRecord(main, "src/stale.ts", "s1\n", "s1\ns2\n", "s1\ns2\n");
  main.write("src/stale.ts", "s1\ns2\nextra\n");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", JITI, ENTRY, "mcp"],
    cwd: main.root,
    stderr: "pipe",
  });
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
}, 60_000);
afterAll(async () => {
  await client.close();
  for (const d of dirs) d.cleanup();
});
describe("MCP tools over stdio _Requirements: 12.1, 12.3, 12.14_", { timeout: 60_000 }, () => {
  it("lists the four read tools, each marked read-only, each with an output schema", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_records",
      "provenance_summary",
      "reveal_file",
      "untouched_agent_text",
    ]);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.outputSchema).toBeDefined();
      expect(tool.description?.startsWith("Call this")).toBe(true);
    }
  });
});
describe("reveal_file _Requirements: 12.4, 12.8_", { timeout: 60_000 }, () => {
  it("returns every span of a current Record, with task number and title on AI spans", async () => {
    const { data, isError, text } = await call("reveal_file", {
      path: "src/a.ts",
      workspace: main.root,
    });
    const out = revealFileOutput.parse(data);
    expect(isError).toBe(false);
    expect(out).toMatchObject({ file: "src/a.ts", status: "current", reason: null });
    expect(out.spans.map((s) => [s.origin, s.length])).toEqual([
      ["PST", 4],
      ["AI", 10],
      ["HUM", 5],
    ]);
    const ai = out.spans[1];
    expect(ai).toMatchObject({ taskNumber: "5.3", taskTitle: "Build the view", startLine: 2 });
    expect(out.legend).toHaveLength(4);
    expect(text.split("\n").length).toBeLessThanOrEqual(5);
    expect(text).not.toContain("\u001b");
    const cli = reveal(main, ["src/a.ts"]);
    expect(cli.stdout).toContain("[AI:");
  });
  it("marks a changed file stale and counts the characters not yet recorded", async () => {
    const { data } = await call("reveal_file", { path: "src/stale.ts", workspace: main.root });
    const out = revealFileOutput.parse(data);
    expect(out.status).toBe("stale");
    expect(out.unrecordedCharacters).toBe(6);
    expect(out.spans.reduce((n, s) => n + s.length, 0)).toBe(6);
    expect(reveal(main, ["src/stale.ts"]).stdout).toContain("stale: src/stale.ts");
  });
  it("returns one PST span for an unchanged file", async () => {
    const { data } = await call("reveal_file", { path: "README.md", workspace: main.root });
    const out = revealFileOutput.parse(data);
    expect(out.status).toBe("unchanged_baseline");
    expect(out.spans.map((s) => [s.origin, s.length, s.run])).toEqual([["PST", 6, null]]);
  });
  it("gives an unrecorded status and a reason for a file that is not tracked", async () => {
    const { data, isError } = await call("reveal_file", { path: "nope.ts", workspace: main.root });
    expect(isError).toBe(false);
    expect(revealFileOutput.parse(data)).toMatchObject({
      status: "unrecorded",
      reason: "not_tracked",
      spans: [],
    });
  });
  it("rejects a path outside the workspace", async () => {
    const outside = await call("reveal_file", { path: "../x.ts", workspace: main.root });
    expect(outside.isError).toBe(true);
    const absolute = await call("reveal_file", { path: "/etc/hosts", workspace: main.root });
    expect(absolute.isError).toBe(true);
  });
});
describe("untouched_agent_text _Requirements: 12.5_", { timeout: 60_000 }, () => {
  it("lists AI spans with taskNumber and taskTitle, the counts and the notice", async () => {
    const { data } = await call("untouched_agent_text", { path: "src/a.ts", workspace: main.root });
    const out = untouchedAgentTextOutput.parse(data);
    expect(out.path).toBe("src/a.ts");
    expect(out.stale).toBe(false);
    expect(out.countsByOrigin).toEqual({ AI: 10, "AI>HUM": 0, HUM: 5, PST: 4 });
    expect(out.stretches).toHaveLength(1);
    expect(out.stretches[0]).toMatchObject({
      origin: "AI",
      length: 10,
      taskNumber: "5.3",
      taskTitle: "Build the view",
    });
    expect(out.notice).toContain("changed while no agent window was open");
    expect(out.notice).toBe(humNotice());
  });
  it("honours top and flags a stale file", async () => {
    const { data } = await call("untouched_agent_text", {
      path: "src/stale.ts",
      top: 1,
      workspace: main.root,
    });
    const out = untouchedAgentTextOutput.parse(data);
    expect(out.stale).toBe(true);
    expect(out.stretches).toHaveLength(1);
  });
  it("is an error for a file with nothing recorded", async () => {
    const { isError } = await call("untouched_agent_text", {
      path: "nope.ts",
      workspace: main.root,
    });
    expect(isError).toBe(true);
  });
});
describe("provenance_summary _Requirements: 12.6_", { timeout: 60_000 }, () => {
  it("matches the totals of reveal --summary and carries the HUM notice only", async () => {
    const { data } = await call("provenance_summary", { workspace: main.root });
    const out = provenanceSummaryOutput.parse(data);
    expect(out.files.map((f) => f.path)).toEqual(["README.md", "src/a.ts", "src/stale.ts"]);
    expect(out.total.characters).toEqual({ AI: 13, "AI>HUM": 0, HUM: 5, PST: 13 });
    expect(out.total.shares.AI).toBeCloseTo(41.9, 1);
    expect(out.windows).toMatchObject([
      { taskNumber: "5.3", taskTitle: "Build the view", files: 2, aiCharacters: 13 },
    ]);
    expect(out.stretches.map((s) => s.file)).toEqual(["src/a.ts", "src/stale.ts"]);
    expect(out.noPromptEventSessions).toBe(0);
    expect(out.notice).toBe(humNotice());
    const cli = reveal(main, ["--summary"]);
    expect(cli.status).toBe(0);
    for (const file of out.files.filter((f) => f.path !== "README.md")) {
      expect(cli.stdout).toContain(file.path);
    }
    expect(cli.stdout).toContain("1 file unchanged since recording started, all [PST].");
  });
  it("scopes to a path", async () => {
    const { data } = await call("provenance_summary", { path: "src/a.ts", workspace: main.root });
    expect(provenanceSummaryOutput.parse(data).files.map((f) => f.path)).toEqual(["src/a.ts"]);
  });
  it("reads noPromptEventSessions from sessions.json: 0 absent, 2 held, 0 unparseable", async () => {
    const d = workspace();
    d.write("f.ts", "x\n");
    await baseline(d);
    unlinkSync(`${d.root}/${PROV}/sessions.json`);
    const first = provenanceSummaryOutput.parse(
      (await call("provenance_summary", { workspace: d.root })).data,
    );
    expect(first.noPromptEventSessions).toBe(0);
    d.write(`${PROV}/sessions.json`, '{ "version": 1, "noPromptEventSessions": 2 }');
    const two = provenanceSummaryOutput.parse(
      (await call("provenance_summary", { workspace: d.root })).data,
    );
    expect(two.noPromptEventSessions).toBe(2);
    expect(two.notice).toBe(`${humNotice()}\n${noPromptSessionsLine(2)}`);
    d.write(`${PROV}/sessions.json`, "{ not json");
    const bad = provenanceSummaryOutput.parse(
      (await call("provenance_summary", { workspace: d.root })).data,
    );
    expect(bad.noPromptEventSessions).toBe(0);
    expect(bad.notice).toBe(humNotice());
  });
});
describe("check_records _Requirements: 12.7_", { timeout: 60_000 }, () => {
  it("marks an error exactly when reveal --check would exit non-zero, with and without strict", async () => {
    const plain = await call("check_records", { workspace: main.root });
    const strict = await call("check_records", { strict: true, workspace: main.root });
    expect(plain.isError).toBe(reveal(main, ["--check"]).status !== 0);
    expect(strict.isError).toBe(reveal(main, ["--check", "--strict"]).status !== 0);
    expect([plain.isError, strict.isError]).toEqual([false, true]);
    const out = checkRecordsOutput.parse(plain.data);
    expect(out.ok).toBe(true);
    expect(out.reports).toEqual([{ path: "src/stale.ts", reason: "stale" }]);
    expect(checkRecordsOutput.parse(strict.data).ok).toBe(false);
  });
  it("fails on a tampered Record without strict", async () => {
    const d = workspace();
    d.write("t.ts", "x\n");
    d.write(`${PROV}/records/t.ts.reveal`, "garbage");
    const { data, isError } = await call("check_records", { workspace: d.root });
    expect(isError).toBe(true);
    expect(reveal(d, ["--check"]).status).toBe(1);
    expect(checkRecordsOutput.parse(data).failures).toEqual([
      { path: "t.ts", reason: "tampered_record" },
    ]);
  });
});
describe("the server is read-only and needs a Record_Directory _Requirements: 12.10, 12.13_", () => {
  it("writes no file under the workspace and starts from the current directory", async () => {
    const before = snapshot(main);
    const calls: [string, Record<string, unknown>][] = [
      ["reveal_file", { path: "src/a.ts" }],
      ["reveal_file", { path: "src/stale.ts" }],
      ["untouched_agent_text", { path: "src/a.ts" }],
      ["provenance_summary", {}],
      ["check_records", { strict: true }],
    ];
    for (const [name, args] of calls) await call(name, args);
    expect(snapshot(main)).toEqual(before);
  });
  it("gives the setup_provenance error for a workspace with no Record_Directory", async () => {
    const empty = makeTempDir();
    dirs.push(empty);
    const { isError, text } = await call("check_records", { workspace: empty.root });
    expect(isError).toBe(true);
    expect(text).toBe(NOT_SET_UP_MESSAGE);
    expect(text).toContain("setup_provenance");
  });
});
