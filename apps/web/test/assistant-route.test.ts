import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXT,
  MAX_PROMPT,
  handleAssistant,
  parseAssistantBody,
} from "../src/server/assistant-route";
import type { AssistantConfig } from "../src/server/deps";
import type { AdapterInput, StreamTextFn } from "../src/server/llm";

const KEY = "sk-ant-SENTINEL-KEY-do-not-leak";
const REGION = "sentinel-region-9";
const NONE: AssistantConfig = { bedrock: null, anthropic: null };
const ANTHROPIC: AssistantConfig = { bedrock: null, anthropic: { apiKey: KEY, modelId: "m-a" } };
const UNUSED_STREAM_TEXT: StreamTextFn = () => ({ textStream: scripted([]) });

async function* scripted(parts: readonly string[]): AsyncGenerator<string, void, undefined> {
  await Promise.resolve();
  for (const part of parts) yield part;
}

function post(body: unknown, init: RequestInit = {}): Request {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/assistant", { method: "POST", body: text, ...init });
}

async function readAll(response: Response): Promise<{ chunks: string[]; bytes: Uint8Array }> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const parts: Uint8Array[] = [];
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    parts.push(step.value);
    chunks.push(decoder.decode(step.value, { stream: true }));
  }
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.length;
  }
  return { chunks, bytes };
}

function adapterFor(stream: (input: AdapterInput) => AsyncIterable<string>) {
  return { streamText: UNUSED_STREAM_TEXT, adapters: { anthropic: stream } };
}

describe("parseAssistantBody _Requirements: 22.8, 22.9_", () => {
  const bad: ReadonlyArray<readonly [string, string]> = [
    ["invalid JSON", "{nope"],
    ["an array", "[]"],
    ["extra property", JSON.stringify({ prompt: "p", context: "", extra: 1 })],
    ["missing context", JSON.stringify({ prompt: "p" })],
    ["non-string prompt", JSON.stringify({ prompt: 5, context: "" })],
    ["empty prompt", JSON.stringify({ prompt: "", context: "" })],
    ["whitespace-only prompt", JSON.stringify({ prompt: " \n\t ", context: "" })],
    ["2001-character prompt", JSON.stringify({ prompt: "a".repeat(MAX_PROMPT + 1), context: "" })],
    [
      "4001-character context",
      JSON.stringify({ prompt: "p", context: "c".repeat(MAX_CONTEXT + 1) }),
    ],
  ];
  for (const [name, text] of bad) {
    it(`${name} is 400 with a fixed message`, () => {
      const parsed = parseAssistantBody(text);
      expect(parsed).toEqual({
        ok: false,
        error: { status: 400, message: "Request body is not valid." },
      });
    });
  }

  it("accepts the limits and trims the prompt", () => {
    const body = { prompt: ` ${"a".repeat(MAX_PROMPT)} `, context: "c".repeat(MAX_CONTEXT) };
    const parsed = parseAssistantBody(JSON.stringify(body));
    expect(parsed.ok && parsed.value.prompt).toBe("a".repeat(MAX_PROMPT));
    expect(parsed.ok && parsed.value.context.length).toBe(MAX_CONTEXT);
  });
});

describe("handleAssistant request errors _Requirements: 22.9_", () => {
  it("bad bodies give 400, no-store, no echo, and never call the provider", async () => {
    let calls = 0;
    const options = adapterFor(() => {
      calls += 1;
      return scripted(["x"]);
    });
    const res = await handleAssistant(
      post({ prompt: "ECHO-ME", context: "", z: 1 }),
      ANTHROPIC,
      options,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).not.toContain("ECHO-ME");
    expect(calls).toBe(0);
  });

  it("an oversize body gives 413", async () => {
    const res = await handleAssistant(post("x".repeat(70_000)), NONE);
    expect(res.status).toBe(413);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("handleAssistant streaming _Requirements: 22.5, 22.8_", () => {
  it("streams the fixture reply as text/plain in several chunks with no-store", async () => {
    const res = await handleAssistant(post({ prompt: "an unrecorded prompt", context: "" }), NONE);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const { chunks } = await readAll(res);
    const expected = readFileSync(
      fileURLToPath(new URL("../fixtures/assistant/default.txt", import.meta.url)),
      "utf8",
    );
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(expected);
  });

  it("passes the trimmed prompt, the context and the config to the adapter", async () => {
    const seen: AdapterInput[] = [];
    const options = adapterFor((input) => {
      seen.push(input);
      return scripted(["hello ", "world"]);
    });
    const res = await handleAssistant(
      post({ prompt: "  write it ", context: "ctx" }),
      ANTHROPIC,
      options,
    );
    expect((await readAll(res)).chunks.join("")).toBe("hello world");
    expect(seen[0]?.provider).toEqual({ name: "anthropic", modelId: "m-a" });
    expect(seen[0]?.prompt).toContain("Request:\nwrite it");
    expect(seen[0]?.prompt).toContain("ctx");
  });

  it("never emits U+FFFD when a surrogate pair is split across chunks", async () => {
    const pair = "\u{1F600}";
    const [hi, lo] = [pair.charAt(0), pair.charAt(1)];
    const parts = [`ab${hi}`, `${lo}cd${hi}`, lo];
    const res = await handleAssistant(
      post({ prompt: "p", context: "" }),
      ANTHROPIC,
      adapterFor(() => scripted(parts)),
    );
    const { bytes } = await readAll(res);
    const text = new TextDecoder().decode(bytes);
    expect(text).toBe(`ab${pair}cd${pair}`);
    expect(text).not.toContain("\uFFFD");
  });

  it("an empty provider stream is a 200 with an empty body", async () => {
    const res = await handleAssistant(
      post({ prompt: "p", context: "" }),
      ANTHROPIC,
      adapterFor(() => scripted([])),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });
});

describe("handleAssistant failures and secrets _Requirements: 22.10, 15.5_", () => {
  const failsFirst = (): AsyncIterable<string> => ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.reject(new Error(`provider said: invalid x-api-key ${KEY} in ${REGION}`)),
    }),
  });

  it("a failure before the first chunk is 502 with a generic message", async () => {
    const res = await handleAssistant(
      post({ prompt: "p", context: "" }),
      { bedrock: { region: REGION, modelId: "mb" }, anthropic: ANTHROPIC.anthropic },
      { streamText: UNUSED_STREAM_TEXT, adapters: { bedrock: failsFirst } },
    );
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({ error: "The assistant is not available right now." });
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(REGION);
  });

  it("a missing adapter (no provider installed) is 502 and leaks nothing", async () => {
    const res = await handleAssistant(post({ prompt: "p", context: "" }), ANTHROPIC);
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain("m-a");
  });

  it("a failure after the first chunk errors the stream with no provider text", async () => {
    async function* failsLater(): AsyncGenerator<string, void, undefined> {
      await Promise.resolve();
      yield "first";
      throw new Error(`boom ${KEY}`);
    }
    const res = await handleAssistant(
      post({ prompt: "p", context: "" }),
      ANTHROPIC,
      adapterFor(() => failsLater()),
    );
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    expect((await reader.read()).done).toBe(false);
    const failure = await reader.read().then(
      () => "no error",
      (error: unknown) => (error instanceof Error ? error.message : "other"),
    );
    expect(failure).toBe("The assistant is not available right now.");
    expect(failure).not.toContain(KEY);
  });

  it("the key sentinel appears in no response, success or failure", async () => {
    const ok = await handleAssistant(
      post({ prompt: "p", context: "" }),
      ANTHROPIC,
      adapterFor(() => scripted(["fine"])),
    );
    const bad = await handleAssistant(post("{"), ANTHROPIC);
    const missing = await handleAssistant(post({ prompt: "p", context: "" }), ANTHROPIC);
    for (const res of [ok, bad, missing]) {
      const text = await res.text();
      expect(text).not.toContain(KEY);
      for (const [, value] of res.headers) expect(value).not.toContain(KEY);
    }
  });
});

describe("handleAssistant abort _Requirements: 22.8_", () => {
  it("aborting the request aborts the provider call", async () => {
    const seen: { signal: AbortSignal | undefined; returned: boolean } = {
      signal: undefined,
      returned: false,
    };
    async function* endless(input: AdapterInput): AsyncGenerator<string, void, undefined> {
      seen.signal = input.signal;
      try {
        await Promise.resolve();
        yield "one";
        await new Promise<void>((resolve) => {
          input.signal?.addEventListener(
            "abort",
            () => {
              resolve();
            },
            { once: true },
          );
        });
      } finally {
        seen.returned = true;
      }
    }
    const client = new AbortController();
    const res = await handleAssistant(
      post({ prompt: "p", context: "" }, { signal: client.signal }),
      ANTHROPIC,
      adapterFor(endless),
    );
    expect(res.status).toBe(200);
    expect(seen.signal?.aborted).toBe(false);
    client.abort();
    expect(seen.signal?.aborted).toBe(true);
    await (res.body as ReadableStream<Uint8Array>).cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.returned).toBe(true);
  });

  it("cancelling the response body aborts the provider call", async () => {
    let signal: AbortSignal | undefined;
    async function* slow(input: AdapterInput): AsyncGenerator<string, void, undefined> {
      signal = input.signal;
      await Promise.resolve();
      yield "one";
      yield "two";
    }
    const res = await handleAssistant(
      post({ prompt: "p", context: "" }),
      ANTHROPIC,
      adapterFor(slow),
    );
    await (res.body as ReadableStream<Uint8Array>).cancel();
    expect(signal?.aborted).toBe(true);
  });
});
