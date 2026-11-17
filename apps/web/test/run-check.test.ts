import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { FAILED_NOTICE } from "../src/client/verify-summary";
import { MAX_TEXT_CHARS } from "../src/limits";
import { CHECKS_BUSY, DOCUMENT_TOO_LONG } from "../src/notices";
import {
  BLANK_TEXT_SENTENCE,
  NO_CITATIONS_SENTENCE,
  runCheck,
} from "../src/check/run-check";
import { ISO, demoMotionText } from "./support/persist-fixtures";
import { routeFetch } from "./support/route-fetch";

const NOW = (): Date => new Date(ISO);

function failing(status: number): { fetch: FetchFn; calls: string[] } {
  const calls: string[] = [];
  const fetchFn: FetchFn = (url) => {
    calls.push(url);
    return Promise.resolve(new Response(JSON.stringify({ error: "x" }), { status }));
  };
  return { fetch: fetchFn, calls };
}

describe("runCheck _Requirements: 4.2, 4.3, 4.4, 5.5, 5.6_", () => {
  it("refuses text over the limit without a request", async () => {
    const server = routeFetch();
    const text = "a".repeat(MAX_TEXT_CHARS + 1);
    const result = await runCheck({ text, api: createApiClient(server.fetch), now: NOW });
    expect(result).toEqual({ kind: "message", text: DOCUMENT_TOO_LONG });
    expect(server.requests).toHaveLength(0);
  });

  it("refuses white space only without a request", async () => {
    const server = routeFetch();
    const result = await runCheck({ text: " \n\t ", api: createApiClient(server.fetch), now: NOW });
    expect(result).toEqual({ kind: "message", text: BLANK_TEXT_SENTENCE });
    expect(server.requests).toHaveLength(0);
  });

  it("says so when the draft holds no full citation, with no request", async () => {
    const server = routeFetch();
    const text = "The plaintiff filed a motion and the court denied it.";
    const result = await runCheck({ text, api: createApiClient(server.fetch), now: NOW });
    expect(result).toEqual({ kind: "message", text: NO_CITATIONS_SENTENCE });
    expect(server.requests).toHaveLength(0);
  });

  it("returns CHECKS_BUSY when the lookup answers 429", async () => {
    const server = failing(429);
    const result = await runCheck({
      text: demoMotionText(),
      api: createApiClient(server.fetch),
      now: NOW,
    });
    expect(result).toEqual({ kind: "message", text: CHECKS_BUSY });
    expect(server.calls).toEqual(["/api/verify"]);
  });

  it("returns FAILED_NOTICE for any other failure", async () => {
    const server = failing(500);
    const result = await runCheck({
      text: demoMotionText(),
      api: createApiClient(server.fetch),
      now: NOW,
    });
    expect(result).toEqual({ kind: "message", text: FAILED_NOTICE });
  });

  it("returns the document, info and check time for a completed run", async () => {
    const server = routeFetch();
    const text = demoMotionText();
    const result = await runCheck({ text, api: createApiClient(server.fetch), now: NOW });
    if (result.kind !== "done") throw new Error(`expected done, got ${result.kind}`);
    expect(result.checkedAt).toBe(new Date(ISO).toISOString());
    expect(result.text).toBe(text);
    expect(result.outcome.status).toBe("completed");
    const statuses = result.document.citations.flatMap((c) =>
      c.kind === "full" ? [c.result.status] : [],
    );
    expect(statuses).not.toContain("unchecked");
    expect(statuses.filter((s) => s === "not_found")).toHaveLength(3);
    expect(result.info.size).toBeGreaterThan(0);
    expect(server.requests[0]?.url).toBe("/api/verify");
  });
});
