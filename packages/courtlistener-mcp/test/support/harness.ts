import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDeps, createFixtureFetch, createMemoryCacheStore } from "@reveal-codes/verifier";
import type { FetchLike } from "@reveal-codes/verifier";
import { createLog } from "../../src/log";
import type { ToolContext } from "../../src/context";
import { sleep } from "../../src/context";
import { createServer } from "../../src/server";

export const NOW = new Date("2026-11-02T12:00:00.000Z");

export type Harness = Readonly<{
  ctx: ToolContext;
  client: Client;
  logs: string[];
  /** Number of requests that reached the fixture fetch. */
  calls: () => number;
  close: () => Promise<void>;
}>;

/** Fixtures-only context: counting fetch over `createFixtureFetch()`, memory cache, no network. */
export function makeCtx(
  token?: string,
): Readonly<{ ctx: ToolContext; logs: string[]; calls: () => number }> {
  const inner = createFixtureFetch();
  let count = 0;
  const fetch: FetchLike = (url, init) => {
    count += 1;
    return inner(url, init);
  };
  const now = (): Date => NOW;
  const logs: string[] = [];
  const deps = createDeps({
    fetch,
    now,
    sleep,
    cache: createMemoryCacheStore({ now }),
    baseUrl: "https://www.courtlistener.com/api/rest/v4",
    ...(token === undefined ? {} : { token }),
  });
  const scrub = (t: string): string =>
    token === undefined ? t : t.split(token).join("[redacted]");
  const log = createLog(token, (line) => logs.push(line));
  return { ctx: { mode: "fixtures", deps, now, log, scrub }, logs, calls: () => count };
}

export async function makeHarness(token?: string): Promise<Harness> {
  const base = makeCtx(token);
  const server = createServer(base.ctx);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    ...base,
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

/** The first text block of a tool result. */
export function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content;
  const first = content?.[0];
  return first?.text ?? "";
}

export function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}
