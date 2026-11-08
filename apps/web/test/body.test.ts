import { describe, expect, it } from "vitest";
import { readBodyCapped } from "../src/server/body";

function streamOf(
  chunks: readonly Uint8Array[],
  onCancel?: () => void,
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[i];
      i += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(chunk);
    },
    cancel() {
      onCancel?.();
    },
  });
}

function requestOf(body: ReadableStream<Uint8Array>, headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/verify", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

describe("readBodyCapped", () => {
  it("reads a body under the cap, including multi-byte text split across chunks", async () => {
    const bytes = new TextEncoder().encode("héllo 😀");
    const req = requestOf(streamOf([bytes.slice(0, 2), bytes.slice(2)]));
    expect(await readBodyCapped(req, 100)).toEqual({ ok: true, text: "héllo 😀" });
  });

  it("accepts a body of exactly the cap", async () => {
    const req = requestOf(streamOf([new Uint8Array(10).fill(97)]));
    const result = await readBodyCapped(req, 10);
    expect(result).toEqual({ ok: true, text: "a".repeat(10) });
  });

  it("stops early on an oversize stream and cancels it", async () => {
    let cancelled = false;
    let pulled = 0;
    const big = new Uint8Array(1000).fill(97);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(big);
      },
      cancel() {
        cancelled = true;
      },
    });
    const result = await readBodyCapped(requestOf(body), 2500);
    expect(result).toEqual({ ok: false });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it("rejects early from a declared content-length over the cap", async () => {
    const over = requestOf(streamOf([new Uint8Array(5)]), { "content-length": "999999" });
    expect(await readBodyCapped(over, 100)).toEqual({ ok: false });
  });

  it("an absent body is empty text", async () => {
    const req = new Request("http://localhost/api/mode", { method: "GET" });
    expect(await readBodyCapped(req, 10)).toEqual({ ok: true, text: "" });
  });
});
