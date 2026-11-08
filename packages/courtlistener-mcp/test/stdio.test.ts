import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TOKEN = "tok_FAKE_stdio_0123456789";
const DEMO = [
  "556 U.S. 662",
  "404 U.S. 519",
  "1047 F.3d 212",
  "1012 F. Supp. 2d 88",
  "912 F.4th 33",
];

type Msg = { id?: number; result?: Record<string, unknown>; error?: unknown };

let child: ChildProcessWithoutNullStreams | undefined;
afterEach(() => {
  child?.kill();
});

/** Spawns `pnpm mcp` and collects stdout lines and stderr text. */
function start(): {
  send: (m: object) => void;
  wait: (id: number) => Promise<Msg>;
  out: string[];
  err: string[];
} {
  child = spawn("pnpm", ["mcp"], {
    cwd: ROOT,
    env: { ...process.env, REVEAL_CODES_FIXTURES_ONLY: "1", COURTLISTENER_TOKEN: TOKEN },
  });
  const out: string[] = [];
  const err: string[] = [];
  const waiters = new Map<number, (m: Msg) => void>();
  let buf = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString("utf8");
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      out.push(line);
      const parsed: unknown = JSON.parse(line);
      const id = (parsed as Msg).id;
      if (typeof id === "number") waiters.get(id)?.(parsed as Msg);
    }
  });
  child.stderr.on("data", (d: Buffer) => err.push(d.toString("utf8")));
  return {
    out,
    err,
    send: (m) => {
      child?.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...m })}\n`);
    },
    wait: (id) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`no reply to ${String(id)}`));
        }, 45_000);
        waiters.set(id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
      }),
  };
}

describe("stdio through pnpm mcp (design R2) _Requirements: 13.11, 13.13, 13.15, 13.16_", () => {
  it("speaks only JSON-RPC on stdout and never leaks the token", async () => {
    const s = start();
    s.send({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "stdio-test", version: "0.0.0" },
      },
    });
    await s.wait(1);
    s.send({ method: "notifications/initialized" });
    s.send({ id: 2, method: "tools/list" });
    const list = await s.wait(2);
    const names = ((list.result?.["tools"] ?? []) as { name: string }[]).map((t) => t.name);
    expect([...names].sort()).toEqual(
      ["check_quote", "get_opinion_text", "lookup_citations", "verifier_status"].sort(),
    );
    s.send({
      id: 3,
      method: "tools/call",
      params: { name: "lookup_citations", arguments: { citations: DEMO } },
    });
    const call = await s.wait(3);
    const content = call.result?.["content"] as { text: string }[];
    const body = JSON.parse(content[0]?.text ?? "{}") as {
      results: { citations: { result: { status: string } }[] }[];
    };
    expect(body.results.map((r) => r.citations[0]?.result.status)).toEqual([
      "verified",
      "verified",
      "not_found",
      "not_found",
      "not_found",
    ]);
    child?.kill();
    expect(s.out.length).toBeGreaterThanOrEqual(3);
    for (const line of s.out) {
      const m = JSON.parse(line) as { jsonrpc?: string };
      expect(m.jsonrpc).toBe("2.0");
      expect(line).not.toContain(TOKEN);
    }
    expect(s.err.join("")).not.toContain(TOKEN);
  }, 60_000);
});
