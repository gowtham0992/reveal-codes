import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { handleAssistant } from "../src/server/assistant-route";
import type { AssistantConfig } from "../src/server/deps";
import { SYSTEM_PROMPT, draft } from "../src/server/llm";
import type { AdapterInput, StreamTextFn } from "../src/server/llm";
import { anthropicAdapter, createAnthropicAdapter } from "../src/server/llm-anthropic";
import { bedrockAdapter, createBedrockAdapter } from "../src/server/llm-bedrock";
import { defaultDraftOptions, sdkStreamText } from "../src/server/llm-default";

const KEY = "sk-test-secret-key-123";
const CONFIG: AssistantConfig = {
  bedrock: { region: "test-region-1", modelId: "bedrock-id-from-env" },
  anthropic: { apiKey: KEY, modelId: "anthropic-id-from-env" },
};
const BEDROCK_ONLY: AssistantConfig = { bedrock: CONFIG.bedrock, anthropic: null };
const ANTHROPIC_ONLY: AssistantConfig = { bedrock: null, anthropic: CONFIG.anthropic };

type Call = Parameters<StreamTextFn>[0];

async function* chunks(parts: readonly string[]): AsyncGenerator<string, void, undefined> {
  await Promise.resolve();
  for (const part of parts) yield part;
}

function recorder(parts: readonly string[]): { fn: StreamTextFn; calls: Call[] } {
  const calls: Call[] = [];
  const fn: StreamTextFn = (options) => {
    calls.push(options);
    return { textStream: chunks(parts) };
  };
  return { fn, calls };
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const part of stream) out.push(part);
  return out;
}

function inputOf(config: AssistantConfig, streamText: StreamTextFn, signal?: AbortSignal) {
  const provider = config.bedrock === null ? "anthropic" : "bedrock";
  const modelId = (config.bedrock ?? config.anthropic)?.modelId ?? null;
  const base: AdapterInput = {
    provider: { name: provider, modelId },
    config,
    streamText,
    system: "sys",
    prompt: "the prompt",
  };
  return signal === undefined ? base : { ...base, signal };
}

describe("provider adapters _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_", () => {
  it("Bedrock builds its model from the configured region and id and streams the text", async () => {
    const built: unknown[] = [];
    const adapter = createBedrockAdapter((settings) => (modelId) => {
      const model = { settings, modelId };
      built.push(model);
      return model;
    });
    const { fn, calls } = recorder(["a", "b"]);
    const abort = new AbortController();
    const out = await collect(adapter(inputOf(BEDROCK_ONLY, fn, abort.signal)));
    expect(out).toEqual(["a", "b"]);
    expect(built).toEqual([
      { settings: { region: "test-region-1" }, modelId: "bedrock-id-from-env" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe(built[0]);
    expect(calls[0]?.system).toBe("sys");
    expect(calls[0]?.prompt).toBe("the prompt");
    expect(calls[0]?.abortSignal).toBe(abort.signal);
  });

  it("Anthropic builds its model from the configured key and id and streams the text", async () => {
    const built: unknown[] = [];
    const adapter = createAnthropicAdapter((settings) => (modelId) => {
      const model = { settings, modelId };
      built.push(model);
      return model;
    });
    const { fn, calls } = recorder(["x"]);
    const out = await collect(adapter(inputOf(ANTHROPIC_ONLY, fn)));
    expect(out).toEqual(["x"]);
    expect(built).toEqual([{ settings: { apiKey: KEY }, modelId: "anthropic-id-from-env" }]);
    expect(calls[0]?.model).toBe(built[0]);
    expect(calls[0]).not.toHaveProperty("abortSignal");
  });

  it("the real adapters build an SDK model without network and pass it on", async () => {
    const real = recorder(["ok"]);
    await collect(bedrockAdapter(inputOf(BEDROCK_ONLY, real.fn)));
    await collect(anthropicAdapter(inputOf(ANTHROPIC_ONLY, real.fn)));
    const [bedrock, anthropic] = real.calls.map((c) => c.model as Record<string, unknown>);
    expect(bedrock?.["modelId"]).toBe("bedrock-id-from-env");
    expect(anthropic?.["modelId"]).toBe("anthropic-id-from-env");
  });

  it("an error before the first chunk is a fixed error with no provider text or key", async () => {
    const boom: StreamTextFn = () => ({
      // eslint-disable-next-line require-yield
      textStream: (async function* () {
        await Promise.resolve();
        throw new Error(`401 invalid key ${KEY} for test-region-1`);
      })(),
    });
    const adapter = createAnthropicAdapter(() => () => ({}));
    const failure = await collect(adapter(inputOf(ANTHROPIC_ONLY, boom))).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("assistant provider failed");
    expect(String(failure)).not.toContain(KEY);
  });

  it("the route answers 502 for a failing provider and leaks nothing", async () => {
    const failing: StreamTextFn = () => ({
      // eslint-disable-next-line require-yield
      textStream: (async function* () {
        await Promise.resolve();
        throw new Error(`secret ${KEY}`);
      })(),
    });
    const request = new Request("http://localhost/api/assistant", {
      method: "POST",
      body: JSON.stringify({ prompt: "p", context: "" }),
    });
    const res = await handleAssistant(request, ANTHROPIC_ONLY, {
      streamText: failing,
      adapters: { anthropic: anthropicAdapter },
    });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(KEY);
  });

  it("draft sends only the system prompt and the prompt with its paragraph to the adapter", async () => {
    const { fn, calls } = recorder(["done"]);
    const out = await collect(
      draft("write", "para", { config: ANTHROPIC_ONLY, streamText: fn, ...defaultAdapters() }),
    );
    expect(out).toEqual(["done"]);
    expect(calls[0]?.system).toBe(SYSTEM_PROMPT);
    expect(calls[0]?.prompt).toBe("Paragraph at the cursor:\npara\n\nRequest:\nwrite");
  });

  it("default wiring installs both adapters and the real stream function", () => {
    expect(defaultDraftOptions.streamText).toBe(sdkStreamText);
    expect(Object.keys(defaultDraftOptions.adapters ?? {}).sort()).toEqual([
      "anthropic",
      "bedrock",
    ]);
  });

  it("with no credentials the default wiring uses the fixture provider, never the SDK", async () => {
    const spy = vi.fn(sdkStreamText);
    const out = await collect(
      draft("Draft a paragraph", "", {
        config: { bedrock: null, anthropic: null },
        ...defaultDraftOptions,
        streamText: spy,
      }),
    );
    expect(spy).not.toHaveBeenCalled();
    expect(out.join("").length).toBeGreaterThan(0);
  });
});

function defaultAdapters(): Pick<NonNullable<Parameters<typeof draft>[2]>, "adapters"> {
  return { adapters: { anthropic: anthropicAdapter, bedrock: bedrockAdapter } };
}

describe("sdkStreamText over a mock model _Requirements: 24.1, 24.4_", () => {
  it("passes the SDK textStream through", async () => {
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({ type: "text-start", id: "1" });
              controller.enqueue({ type: "text-delta", id: "1", delta: "Hello " });
              controller.enqueue({ type: "text-delta", id: "1", delta: "there" });
              controller.enqueue({ type: "text-end", id: "1" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              });
              controller.close();
            },
          }),
        }),
    });
    const out = await collect(sdkStreamText({ model, system: "s", prompt: "p" }).textStream);
    expect(out.join("")).toBe("Hello there");
  });

  it("a provider failure becomes a fixed error and is not logged", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const model = new MockLanguageModelV4({
      doStream: () => Promise.reject(new Error(`bad key ${KEY}`)),
    });
    const failure = await collect(
      sdkStreamText({ model, system: "s", prompt: "p" }).textStream,
    ).then(
      () => null,
      (error: unknown) => error,
    );
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("assistant provider failed");
    expect(String(failure)).not.toContain(KEY);
  });
});

describe("provider modules hold no model id _Requirements: 22.6, 24.2_", () => {
  const files = ["llm-bedrock.ts", "llm-anthropic.ts", "llm-default.ts", "llm.ts"];
  const MODEL_ID = /claude|anthropic\.|amazon\.|meta\.|mistral|\bnova\b|-v\d+:\d|\b20\d{6}\b/i;
  for (const name of files) {
    it(`${name} contains no model id literal`, () => {
      const url = new URL(`../src/server/${name}`, import.meta.url);
      const text = readFileSync(fileURLToPath(url), "utf8");
      const literals = [...text.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)].map(
        (m) => m[1] ?? m[2] ?? m[3] ?? "",
      );
      expect(literals.filter((l) => MODEL_ID.test(l))).toEqual([]);
    });
  }
});
