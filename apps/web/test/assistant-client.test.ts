import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client/api";
import type { FetchFn } from "../src/client/api";
import { handleAssistant } from "../src/server/assistant-route";

function chunked(parts: readonly Uint8Array[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
  return new Response(stream, { status });
}

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("ApiClient.draft _Requirements: 22.8_", () => {
  it("posts { prompt, context } and delivers chunks in order", async () => {
    const seen: { url: string; method?: string; body?: string }[] = [];
    const fetchFn: FetchFn = (url, init) => {
      seen.push({
        url,
        ...(init?.method === undefined ? {} : { method: init.method }),
        ...(init?.body === undefined ? {} : { body: init.body }),
      });
      return Promise.resolve(chunked([bytes("Hello, "), bytes("world")]));
    };
    const got: string[] = [];
    const result = await createApiClient(fetchFn).draft("write", "ctx", (t) => got.push(t));
    expect(result).toEqual({ ok: true, value: undefined });
    expect(got).toEqual(["Hello, ", "world"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("/api/assistant");
    expect(seen[0]?.method).toBe("POST");
    expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ prompt: "write", context: "ctx" });
  });

  it("holds a multi-byte character split across reads until it is whole", async () => {
    const all = bytes("a\u{1F600}b");
    const parts = [all.slice(0, 2), all.slice(2, 4), all.slice(4)];
    const got: string[] = [];
    const result = await createApiClient(() => Promise.resolve(chunked(parts))).draft(
      "p",
      "",
      (t) => got.push(t),
    );
    expect(result.ok).toBe(true);
    expect(got.join("")).toBe("a\u{1F600}b");
    expect(got.join("")).not.toContain("\uFFFD");
  });

  it("returns status, network and shape errors as values", async () => {
    const draft = (fetchFn: FetchFn) => createApiClient(fetchFn).draft("p", "", () => undefined);
    expect(await draft(() => Promise.resolve(new Response("{}", { status: 502 })))).toEqual({
      ok: false,
      error: { kind: "status", status: 502 },
    });
    expect(await draft(() => Promise.reject(new Error("offline")))).toEqual({
      ok: false,
      error: { kind: "network" },
    });
    expect(await draft(() => Promise.resolve(new Response(null, { status: 200 })))).toEqual({
      ok: false,
      error: { kind: "shape" },
    });
  });

  it("an aborted stream is a network error and stops delivering", async () => {
    const abort = new AbortController();
    const fetchFn: FetchFn = (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes("one"));
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return Promise.resolve(new Response(stream));
    };
    const got: string[] = [];
    const result = await createApiClient(fetchFn).draft(
      "p",
      "",
      (t) => {
        got.push(t);
        abort.abort();
      },
      abort.signal,
    );
    expect(result).toEqual({ ok: false, error: { kind: "network" } });
    expect(got).toEqual(["one"]);
  });

  it("streams the real fixture route end to end", async () => {
    const fetchFn: FetchFn = (url, init) =>
      handleAssistant(
        new Request(`http://localhost${url}`, {
          method: init?.method ?? "GET",
          ...(init?.body === undefined ? {} : { body: init.body }),
        }),
        { bedrock: null, anthropic: null },
      );
    const got: string[] = [];
    const result = await createApiClient(fetchFn).draft("anything", "", (t) => got.push(t));
    expect(result.ok).toBe(true);
    expect(got.length).toBeGreaterThan(1);
    expect(got.join("").length).toBeGreaterThan(64);
  });
});
