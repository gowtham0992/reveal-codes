import { afterEach, describe, expect, it } from "vitest";
import { createLog, redact } from "../src/log";
import { isError, makeHarness, textOf } from "./support/harness";
import type { Harness } from "./support/harness";

const TOKEN = "tok_FAKE_0123456789abcdef";
let h: Harness | undefined;
afterEach(async () => {
  await h?.close();
});

describe("the token never leaves the process _Requirements: 13.14, 11.4_", () => {
  it("appears in no tool result, error or log line", async () => {
    h = await makeHarness(TOKEN);
    const calls = [
      { name: "lookup_citations", arguments: { citations: ["556 U.S. 662", "1047 F.3d 212"] } },
      { name: "lookup_citations", arguments: { citations: [] } },
      { name: "get_opinion_text", arguments: { clusterId: 145875 } },
      { name: "get_opinion_text", arguments: { clusterId: 424242 } },
      { name: "check_quote", arguments: { clusterId: 145875, quote: "x" } },
      { name: "check_quote", arguments: { clusterId: 0, quote: "x" } },
      { name: "verifier_status", arguments: {} },
    ];
    const seen: string[] = [];
    for (const c of calls) {
      const res = await h.client.callTool(c);
      seen.push(JSON.stringify(res));
    }
    expect(seen.some((s) => s.includes("verified"))).toBe(true);
    expect(
      isError(await h.client.callTool({ name: "lookup_citations", arguments: { citations: [] } })),
    ).toBe(true);
    expect(h.logs.length).toBeGreaterThan(0);
    for (const out of [...seen, ...h.logs]) expect(out).not.toContain(TOKEN);
  });

  it("is replaced by [redacted] in log lines and in handler failures", async () => {
    h = await makeHarness(TOKEN);
    h.ctx.log(`request failed with Authorization: Token ${TOKEN}`);
    expect(h.logs.at(-1)).toBe("request failed with Authorization: Token [redacted]");
    expect(h.ctx.scrub(`boom ${TOKEN} ${TOKEN}`)).toBe("boom [redacted] [redacted]");
    expect(textOf({ content: [{ type: "text", text: "x" }] })).toBe("x");
  });

  it("redact leaves text alone without a token", () => {
    expect(redact("abc", undefined)).toBe("abc");
    expect(redact("abc", "")).toBe("abc");
    const lines: string[] = [];
    createLog(undefined, (l) => lines.push(l))("plain");
    expect(lines).toEqual(["plain"]);
  });
});
