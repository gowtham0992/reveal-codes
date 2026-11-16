import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import { textOf } from "./support/harness";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const POWER = join(ROOT, "powers", "citation-check");
const SERVER = join("server", "courtlistener-mcp.mjs");
const PLACEHOLDER = "${COURTLISTENER_TOKEN}";

const readText = (...parts: string[]): string => readFileSync(join(...parts), "utf8");
const readJson = (...parts: string[]): unknown => JSON.parse(readText(...parts));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function record(v: unknown): Record<string, unknown> {
  if (!isRecord(v)) throw new Error("expected an object");
  return v;
}

/** Every file under `dir` as a sorted list of paths relative to it. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();
}

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

describe("Power manifests", () => {
  const plugin = record(readJson(POWER, "plugin.json"));
  const mcp = record(readJson(POWER, "mcp.json"));
  const rootPackage = record(readJson(ROOT, "package.json"));

  it("plugin.json carries every field the schema and the brief require, and no other", () => {
    const allowed = [
      "$schema",
      "name",
      "version",
      "description",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
      "extensions",
    ];
    expect(Object.keys(plugin).filter((k) => !allowed.includes(k))).toEqual([]);
    expect(plugin["$schema"]).toBe("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
    expect(plugin["name"]).toBe("reveal-codes-citations");
    expect(plugin["name"]).toMatch(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
    expect(plugin["version"]).toBe("0.1.0");
    expect(typeof plugin["description"]).toBe("string");
    expect(record(plugin["author"])).toEqual({
      name: "Reveal Codes",
      url: "https://github.com/gowtham0992/reveal-codes",
    });
    expect(plugin["license"]).toBe(rootPackage["license"]);
    const keywords = plugin["keywords"];
    expect(Array.isArray(keywords)).toBe(true);
    for (const word of [
      "citation",
      "case law",
      "court filing",
      "courtlistener",
      "standing order",
    ]) {
      expect(keywords).toContain(word);
    }
  });

  it("mcp.json declares one stdio server and exactly the two environment entries", () => {
    expect(Object.keys(mcp).sort()).toEqual(["$schema", "mcpServers"]);
    expect(mcp["$schema"]).toBe("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
    const servers = record(mcp["mcpServers"]);
    expect(Object.keys(servers)).toEqual(["courtlistener"]);
    expect(servers["courtlistener"]).toEqual({
      type: "stdio",
      command: "node",
      args: ["${PLUGIN_ROOT}/server/courtlistener-mcp.mjs"],
      env: {
        COURTLISTENER_TOKEN: PLACEHOLDER,
        REVEAL_CODES_CACHE_DIR: "${PLUGIN_DATA}/cache",
      },
    });
  });

  it("mcp.json contains no token value: every environment value is a placeholder", () => {
    const server = record(record(mcp["mcpServers"])["courtlistener"]);
    for (const value of Object.values(record(server["env"]))) {
      expect(value).toMatch(/^\$\{[A-Z_]+\}(\/[a-z]+)?$/);
    }
    expect(readText(POWER, "mcp.json")).not.toMatch(/[A-Za-z0-9]{32,}/);
  });
});

describe("Power build is current", () => {
  it("rebuilding to a temp directory reproduces the committed generated files byte for byte", () => {
    const out = tempDir("power-build-");
    const run = spawnSync("node", [join(ROOT, "scripts", "build-power.mjs"), out], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
    const generated = [
      SERVER,
      join("skills", "court-ai-rules", "references", "standing-orders.json"),
    ];
    for (const file of generated) {
      expect(readFileSync(join(out, file)).equals(readFileSync(join(POWER, file))), file).toBe(
        true,
      );
    }
    const built = filesUnder(join(out, "server", "fixtures"));
    expect(filesUnder(join(POWER, "server", "fixtures"))).toEqual(built);
    expect(built.length).toBeGreaterThan(0);
    for (const file of built) {
      const a = readFileSync(join(out, "server", "fixtures", file));
      expect(a.equals(readFileSync(join(POWER, "server", "fixtures", file))), file).toBe(true);
    }
  }, 60_000);

  it("copies the verifier fixtures and the dataset from their sources", () => {
    const source = join(ROOT, "packages", "verifier", "fixtures");
    expect(filesUnder(join(POWER, "server", "fixtures"))).toEqual(filesUnder(source));
    expect(readText(POWER, "skills", "court-ai-rules", "references", "standing-orders.json")).toBe(
      readText(ROOT, "data", "standing-orders.json"),
    );
  });
});

/** Copies the Power outside the repository and connects to its server over stdio. */
async function connect(
  token: string | undefined,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const dir = tempDir("power-run-");
  cpSync(POWER, dir, { recursive: true });
  expect(relative(ROOT, dir).startsWith("..")).toBe(true);
  expect(dir.split(sep)).not.toContain("node_modules");
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "" };
  if (token !== undefined) env["COURTLISTENER_TOKEN"] = token;
  const transport = new StdioClientTransport({ command: "node", args: [SERVER], cwd: dir, env });
  const client = new Client({ name: "power-test", version: "0.0.0" });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

const lineWith = (file: string[], needle: string): string => {
  const line = readText(ROOT, ...file)
    .split("\n")
    .find((l) => l.includes(needle));
  if (line === undefined) throw new Error(`no line with ${needle}`);
  return line;
};
const DEMO_LINE = lineWith(["packages", "engine", "fixtures", "demo-motion.txt"], "556 U.S. 662");
const AVIANCA_LINE = lineWith(
  ["packages", "engine", "fixtures", "avianca-citations.txt"],
  "174 F.3d 366",
);

type Status = { mode: string; message: string };
async function statusOf(client: Client): Promise<Status> {
  const res = await client.callTool({ name: "verifier_status", arguments: {} });
  return JSON.parse(textOf(res)) as Status;
}

describe("Power server over stdio, from a copy outside the repository", () => {
  it("with no token answers from the fixtures, says so, and finds a wrong_case citation", async () => {
    const { client, close } = await connect(undefined);
    try {
      const status = await statusOf(client);
      expect(status.mode).toBe("fixtures");
      expect(status.message).toContain("recorded CourtListener responses");
      const res = await client.callTool({
        name: "lookup_citations",
        arguments: { citations: [DEMO_LINE, AVIANCA_LINE] },
      });
      const body = JSON.parse(textOf(res)) as {
        results: { citations: { caseName?: string; result: Record<string, unknown> }[] }[];
      };
      expect(body.results[0]?.citations[0]?.result).toEqual({
        status: "verified",
        clusterId: "145875",
      });
      expect(body.results[1]?.citations[0]?.result).toEqual({
        status: "wrong_case",
        clusterId: "3011108",
        foundName: "Greenleaf v. Garlock, Inc.",
        foundYear: 1999,
      });
      const quote = await client.callTool({
        name: "check_quote",
        arguments: {
          clusterId: 108432,
          quote: "less stringent standards than formal pleadings drafted by lawyers",
        },
      });
      expect(JSON.parse(textOf(quote))).toEqual({ status: "match" });
      const tools = (await client.listTools()).tools.map((t) => t.name).sort();
      expect(tools).toEqual([
        "check_quote",
        "get_opinion_text",
        "lookup_citations",
        "verifier_status",
      ]);
    } finally {
      await close();
    }
  }, 60_000);

  it("treats the literal placeholder and an empty token as no token", async () => {
    for (const token of [PLACEHOLDER, ""]) {
      const { client, close } = await connect(token);
      try {
        expect((await statusOf(client)).mode).toBe("fixtures");
      } finally {
        await close();
      }
    }
  }, 60_000);

  it("with a real-looking token is in live mode", async () => {
    const { client, close } = await connect("tok_FAKE_power_0123456789");
    try {
      const status = await statusOf(client);
      expect(status.mode).toBe("live");
      expect(status.message).toContain("Live mode");
      expect(JSON.stringify(status)).not.toContain("tok_FAKE_power_0123456789");
    } finally {
      await close();
    }
  }, 60_000);
});

describe("Power skills", () => {
  const skills = ["check-citations", "court-ai-rules"];
  const skillText = (name: string): string => readText(POWER, "skills", name, "SKILL.md");

  it("each SKILL.md has name and description front matter, and the name is its folder", () => {
    for (const name of skills) {
      const match = /^---\n([\s\S]*?)\n---\n/.exec(skillText(name));
      expect(match, name).not.toBeNull();
      const front = match?.[1] ?? "";
      expect(front).toMatch(new RegExp(`^name: ${name}$`, "m"));
      expect(front).toMatch(/^description: \S.{20,}$/m);
    }
  });

  it("every tool a skill tells Kiro to call exists in the server", async () => {
    const { client, close } = await connect(undefined);
    try {
      const tools = (await client.listTools()).tools.map((t) => t.name);
      const called = (name: string): string[] =>
        [...skillText(name).matchAll(/\b[Cc]all `([a-z_]+)`/g)].flatMap((m) => m[1] ?? []);
      expect([...new Set(called("check-citations"))].sort()).toEqual([
        "check_quote",
        "lookup_citations",
        "verifier_status",
      ]);
      for (const name of skills) {
        for (const tool of called(name)) expect(tools, `${name}: ${tool}`).toContain(tool);
      }
      expect(called("court-ai-rules")).toEqual([]);
    } finally {
      await close();
    }
  }, 60_000);

  it("check-citations links its status reference, which names every code", () => {
    expect(skillText("check-citations")).toContain("references/statuses.md");
    const statuses = readText(POWER, "skills", "check-citations", "references", "statuses.md");
    for (const code of ["CIT ✓", "CIT ≠", "CIT ✘", "CIT ?", "QUO ✓", "QUO ✘"]) {
      expect(statuses).toContain(`\`${code}\``);
    }
  });

  it("court-ai-rules reads the bundled dataset it names", () => {
    expect(skillText("court-ai-rules")).toContain("references/standing-orders.json");
    const data = record(
      readJson(POWER, "skills", "court-ai-rules", "references", "standing-orders.json"),
    );
    expect(Array.isArray(data["entries"])).toBe(true);
    expect(typeof data["compiled"]).toBe("string");
  });
});
