import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleCheckQuote } from "../src/tools/check-quote";
import { handleGetOpinionText } from "../src/tools/get-opinion-text";
import { handleLookupCitations } from "../src/tools/lookup-citations";
import { handleVerifierStatus } from "../src/tools/verifier-status";
import { isError, makeCtx, makeHarness, textOf } from "./support/harness";
import type { Harness } from "./support/harness";

const SENTENCE = "See Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).";
let h: Harness;
beforeEach(async () => {
  h = await makeHarness();
});
afterEach(async () => {
  await h.close();
});

async function call(name: string, args: Record<string, unknown>) {
  return h.client.callTool({ name, arguments: args });
}

describe("lookup_citations _Requirements: 13.2, 13.3_", () => {
  it("returns text, offsets, source index and result", async () => {
    const res = await call("lookup_citations", { citations: ["no cites here", SENTENCE] });
    expect(isError(res)).toBe(false);
    const body = JSON.parse(textOf(res)) as {
      results: { index: number; citations: Record<string, unknown>[] }[];
    };
    expect(body.results[0]).toEqual({ index: 0, citations: [] });
    const [c] = body.results[1]?.citations ?? [];
    expect(body.results[1]?.index).toBe(1);
    expect(c).toMatchObject({ kind: "full", result: { status: "verified", clusterId: "145875" } });
    const start = c?.["start"] as number;
    const end = c?.["end"] as number;
    expect(SENTENCE.slice(start, end)).toBe(c?.["text"]);
    expect(String(c?.["text"])).toContain("556 U.S. 662");
  });

  it("gives two verified and three not_found for the demo citations", async () => {
    const citations = [
      "556 U.S. 662",
      "404 U.S. 519",
      "1047 F.3d 212",
      "1012 F. Supp. 2d 88",
      "912 F.4th 33",
    ];
    const body = JSON.parse(textOf(await call("lookup_citations", { citations }))) as {
      results: { citations: { result: { status: string } }[] }[];
    };
    const statuses = body.results.map((r) => r.citations[0]?.result.status);
    expect(statuses).toEqual(["verified", "verified", "not_found", "not_found", "not_found"]);
  });

  it("reports a short form with its target's result and an other reference as null", async () => {
    const text = `${SENTENCE} Id. at 680. See 42 U.S.C. § 1983.`;
    const body = JSON.parse(textOf(await call("lookup_citations", { citations: [text] }))) as {
      results: { citations: { kind: string; result: { status: string } | null }[] }[];
    };
    const cites = body.results[0]?.citations ?? [];
    expect(cites.find((c) => c.kind === "short")?.result?.status).toBe("verified");
    expect(cites.find((c) => c.kind === "other")?.result).toBeNull();
  });

  it("returns an error naming citations[i] for a lone surrogate, before any request", async () => {
    const { ctx, calls } = makeCtx();
    const res = await handleLookupCitations({ citations: ["ok", "bad \ud800"] }, ctx);
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("citations[1]");
    expect(calls()).toBe(0);
  });
});

describe("lookup_citations case match _Requirements: 5.12, 5.13_", () => {
  type Cite = { kind: string; result: Record<string, unknown> | null } & Record<string, unknown>;
  async function citesOf(text: string): Promise<Cite[]> {
    const res = await call("lookup_citations", { citations: [text] });
    const body = JSON.parse(textOf(res)) as { results: { citations: Cite[] }[] };
    return body.results[0]?.citations ?? [];
  }

  it("reports wrong_case with the found name and the cited name for a different case", async () => {
    const [c] = await citesOf("Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009)");
    expect(c?.["result"]).toEqual({
      status: "wrong_case",
      clusterId: "145875",
      foundName: "Ashcroft v. Iqbal",
      foundYear: 2009,
    });
    expect(c?.["caseName"]).toBe("Henderson v. Pacific Housing Authority");
  });

  it("reports verified with no caseName key for a bare citation", async () => {
    const [c] = await citesOf("556 U.S. 662");
    expect(c?.["result"]).toEqual({ status: "verified", clusterId: "145875" });
    expect(c).not.toHaveProperty("caseName");
  });

  it("gives caseName on the full citation and none on its short form", async () => {
    const cites = await citesOf("Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). Id. at 680.");
    const full = cites.find((c) => c.kind === "full");
    const short = cites.find((c) => c.kind === "short");
    expect(full?.result).toMatchObject({ status: "verified" });
    expect(full?.["caseName"]).toBe("Ashcroft v. Iqbal");
    expect(short?.result).toMatchObject({ status: "verified" });
    expect(short).not.toHaveProperty("caseName");
  });
});

describe("argument bounds _Requirements: 13.12_", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["lookup_citations", { citations: [] }, "citations"],
    ["lookup_citations", { citations: Array.from({ length: 51 }, () => "a") }, "citations"],
    ["lookup_citations", { citations: ["x".repeat(2001)] }, "citations"],
    ["lookup_citations", { citations: [""] }, "citations"],
    ["lookup_citations", { citations: [5] }, "citations"],
    ["lookup_citations", {}, "citations"],
    ["get_opinion_text", { clusterId: 0 }, "clusterId"],
    ["get_opinion_text", { clusterId: 1.5 }, "clusterId"],
    ["get_opinion_text", { clusterId: "145875" }, "clusterId"],
    ["get_opinion_text", {}, "clusterId"],
    ["check_quote", { clusterId: 0, quote: "q" }, "clusterId"],
    ["check_quote", { clusterId: 1.5, quote: "q" }, "clusterId"],
    ["check_quote", { clusterId: "1", quote: "q" }, "clusterId"],
    ["check_quote", { clusterId: 145875, quote: "" }, "quote"],
    ["check_quote", { clusterId: 145875, quote: "q".repeat(10_001) }, "quote"],
    ["check_quote", { clusterId: 145875 }, "quote"],
  ];

  it.each(cases)(
    "%s %j: the SDK returns a tool error naming %s and nothing is fetched",
    async (name, args, arg) => {
      const res = await call(name, args);
      expect(isError(res)).toBe(true);
      expect(textOf(res)).toContain(arg);
      expect(h.calls()).toBe(0);
    },
  );

  it.each(cases)(
    "%s %j: the handler itself names %s and calls no Verifier function",
    async (name, args, arg) => {
      const { ctx, calls } = makeCtx();
      const handlers: Record<string, (a: unknown) => Promise<{ isError?: true } & object>> = {
        lookup_citations: (a) => handleLookupCitations(a, ctx),
        get_opinion_text: (a) => handleGetOpinionText(a, ctx),
        check_quote: (a) => handleCheckQuote(a, ctx),
      };
      const res = await handlers[name]?.(args);
      expect((res as { isError?: boolean }).isError).toBe(true);
      expect(textOf(res)).toContain(arg);
      expect(calls()).toBe(0);
      expect(ctx.deps.state.counters.value).toEqual({ hits: 0, misses: 0, writes: 0 });
    },
  );

  it("accepts the boundary values 50 strings, 2000 characters and 10000 characters", async () => {
    const fifty = Array.from({ length: 50 }, () => "x".repeat(2000));
    expect(isError(await call("lookup_citations", { citations: fifty }))).toBe(false);
    const quote = "q".repeat(10_000);
    expect(isError(await call("check_quote", { clusterId: 145875, quote }))).toBe(false);
  });
});

describe("get_opinion_text and check_quote _Requirements: 13.4, 13.5, 13.6, 13.7_", () => {
  it("returns the opinion text for a known cluster", async () => {
    const body = JSON.parse(textOf(await call("get_opinion_text", { clusterId: 145875 }))) as {
      clusterId: number;
      text: string;
    };
    expect(body.clusterId).toBe(145875);
    expect(body.text.length).toBeGreaterThan(100);
  });

  it("returns a message, not an error, for an unavailable opinion", async () => {
    const res = await call("get_opinion_text", { clusterId: 424242 });
    expect(isError(res)).toBe(false);
    expect(JSON.parse(textOf(res))).toEqual({
      clusterId: 424242,
      text: null,
      message: "Opinion text is unavailable for clusterId 424242.",
    });
  });

  it("checks a quote taken from the opinion as match and an invented one as mismatch", async () => {
    const opinion = JSON.parse(textOf(await call("get_opinion_text", { clusterId: 145875 }))) as {
      text: string;
    };
    const real = opinion.text.split(/\s+/).slice(40, 52).join(" ");
    const ok = await call("check_quote", { clusterId: 145875, quote: real });
    expect(JSON.parse(textOf(ok))).toEqual({ status: "match" });
    const bad = await call("check_quote", { clusterId: 145875, quote: `${real} zzyzx invented` });
    expect(JSON.parse(textOf(bad))).toMatchObject({ status: "mismatch" });
  });

  it("returns unchecked with a reason when the text is unavailable", async () => {
    const res = await call("check_quote", { clusterId: 424242, quote: "anything" });
    expect(isError(res)).toBe(false);
    expect(JSON.parse(textOf(res))).toEqual({
      status: "unchecked",
      reason: "Opinion text is unavailable for clusterId 424242.",
    });
  });
});

describe("verifier_status _Requirements: 13.8_", () => {
  it("returns the bucket and counters", async () => {
    const body: unknown = JSON.parse(textOf(await call("verifier_status", {})));
    expect(body).toEqual({
      bucket: { available: 60, capacity: 60 },
      counters: { hits: 0, misses: 0, writes: 0 },
      mode: "fixtures",
      message: expect.any(String) as string,
    });
  });

  it("handler result equals verifierStatus of the context", () => {
    const { ctx } = makeCtx();
    expect(JSON.parse(textOf(handleVerifierStatus(ctx)))).toEqual({
      bucket: { available: 60, capacity: 60 },
      counters: { hits: 0, misses: 0, writes: 0 },
      mode: "fixtures",
      message: expect.any(String) as string,
    });
  });
});
describe("verifier_status mode", () => {
  it("says in plain words which mode is in use", () => {
    const base = makeCtx().ctx;
    const text = (mode: "fixtures" | "live" | "live_without_token"): string =>
      textOf(handleVerifierStatus({ ...base, mode }));
    expect(text("fixtures")).toContain("recorded CourtListener responses");
    expect(text("live")).toContain("Live mode: citations are checked against CourtListener");
    expect(text("live_without_token")).toContain("COURTLISTENER_TOKEN is not set");
  });
});
