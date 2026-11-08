import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeHarness } from "./support/harness";
import type { Harness } from "./support/harness";

let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(async () => {
  await h.close();
});

describe("createServer _Requirements: 13.1, 13.12_", () => {
  it("registers exactly the four tools, with JSON Schema for the three that take arguments", async () => {
    const { tools } = await h.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_quote",
      "get_opinion_text",
      "lookup_citations",
      "verifier_status",
    ]);
    const lookup = tools.find((t) => t.name === "lookup_citations");
    expect(JSON.stringify(lookup?.inputSchema)).toContain("maxItems");
  });

  it("makes no Verifier call on bad arguments", async () => {
    await h.client.callTool({ name: "lookup_citations", arguments: { citations: [] } });
    await h.client.callTool({ name: "get_opinion_text", arguments: { clusterId: -1 } });
    await h.client.callTool({ name: "check_quote", arguments: { clusterId: 1 } });
    expect(h.calls()).toBe(0);
    expect(h.ctx.deps.state.counters.value).toEqual({ hits: 0, misses: 0, writes: 0 });
  });
});
