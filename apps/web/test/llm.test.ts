import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readServerConfig } from "../src/server/deps";
import type { AssistantConfig } from "../src/server/deps";
import { draft, limitContext, selectProvider, SYSTEM_PROMPT } from "../src/server/llm";
import type { AdapterInput, StreamTextFn } from "../src/server/llm";
import { chunkText, createFixtureReader, promptHash } from "../src/server/llm-fixture";

const BEDROCK = { region: "r-1", modelId: "bedrock-model-x", roleArn: null };
const ANTHROPIC = { apiKey: "key-x", modelId: "anthropic-model-y" };

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

async function* oneChunk(text: string): AsyncGenerator<string, void, undefined> {
  await Promise.resolve();
  yield text;
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const part of stream) out.push(part);
  return out;
}

describe("selectProvider _Requirements: 22.1, 22.2, 22.3_", () => {
  const table: ReadonlyArray<readonly [string, AssistantConfig, string, string | null]> = [
    ["both pairs set", { bedrock: BEDROCK, anthropic: ANTHROPIC }, "bedrock", "bedrock-model-x"],
    ["Bedrock only", { bedrock: BEDROCK, anthropic: null }, "bedrock", "bedrock-model-x"],
    ["Anthropic only", { bedrock: null, anthropic: ANTHROPIC }, "anthropic", "anthropic-model-y"],
    ["neither", { bedrock: null, anthropic: null }, "fixture", null],
  ];
  for (const [name, config, provider, modelId] of table) {
    it(`${name}: ${provider}`, () => {
      expect(selectProvider(config)).toEqual({ name: provider, modelId });
    });
  }

  const envCases: ReadonlyArray<readonly [string, Record<string, string>, string]> = [
    ["Bedrock partial (region only)", { AWS_REGION: "r" }, "fixture"],
    [
      "Bedrock partial (model only) falls to Anthropic",
      { BEDROCK_MODEL_ID: "m", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "a" },
      "anthropic",
    ],
    ["Bedrock pair empty strings", { AWS_REGION: "", BEDROCK_MODEL_ID: "" }, "fixture"],
    ["Anthropic partial (key only)", { ANTHROPIC_API_KEY: "k" }, "fixture"],
    ["Bedrock complete", { AWS_REGION: "r", BEDROCK_MODEL_ID: "m" }, "bedrock"],
  ];
  for (const [name, env, provider] of envCases) {
    it(`from env: ${name}`, () => {
      expect(selectProvider(readServerConfig(env).assistant).name).toBe(provider);
    });
  }
});

describe("promptHash and chunkText _Requirements: 22.4, 22.5_", () => {
  it("is 16 hex digits and stable under whitespace differences", () => {
    const a = promptHash("  Draft   a\n\tparagraph  ");
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(promptHash("Draft a paragraph")).toBe(a);
    expect(promptHash("Draft a different paragraph")).not.toBe(a);
  });

  it("chunks are at most 64 long and concatenate to the text", () => {
    const text = "word ".repeat(100);
    const chunks = chunkText(text, 64);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 64)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  it("never splits a surrogate pair", () => {
    const text = `${"a".repeat(63)}\u{1F600}${"b".repeat(10)}`;
    const chunks = chunkText(text, 64);
    expect(chunks.join("")).toBe(text);
    expect(chunks[0]).toBe("a".repeat(63));
    for (const c of chunks) expect(c).not.toMatch(LONE_SURROGATE);
  });

  it("returns no chunks for empty text", () => {
    expect(chunkText("", 64)).toEqual([]);
  });
});

describe("fixture provider _Requirements: 22.4, 22.5_", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("returns default.txt for an unknown prompt, in chunks of at most 64", async () => {
    const parts = await collect(draft("a prompt nobody recorded", ""));
    const expected = readFileSync(
      fileURLToPath(new URL("../fixtures/assistant/default.txt", import.meta.url)),
      "utf8",
    );
    expect(parts.every((p) => p.length <= 64)).toBe(true);
    expect(parts.join("")).toBe(expected);
  });

  it("returns <hash>.txt when a recording exists for the prompt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rc-assistant-"));
    dirs.push(dir);
    await writeFile(join(dir, `${promptHash("hello world")}.txt`), "recorded reply", "utf8");
    await writeFile(join(dir, "default.txt"), "default reply", "utf8");
    const readFixture = createFixtureReader([dir]);
    expect((await collect(draft("  hello   world ", "", { readFixture }))).join("")).toBe(
      "recorded reply",
    );
    expect((await collect(draft("other", "", { readFixture }))).join("")).toBe("default reply");
  });

  it("the shipped default names no real citation", () => {
    const text = readFileSync(
      fileURLToPath(new URL("../fixtures/assistant/default.txt", import.meta.url)),
      "utf8",
    );
    expect(text).not.toMatch(/\d+\s+(?:U\.S\.|F\.\d?d|F\. ?Supp|S\. ?Ct)\b|\bv\.\s+[A-Z]/);
  });
});

describe("context limit and system prompt _Requirements: 22.6, 22.7_", () => {
  it("keeps short context and the last 4000 units of long context", () => {
    expect(limitContext("short")).toBe("short");
    const long = "x".repeat(10) + "y".repeat(4000);
    expect(limitContext(long)).toBe("y".repeat(4000));
  });

  it("drops a low surrogate left at the cut", () => {
    const text = `\u{1F600}${"z".repeat(3999)}`;
    expect(text.length).toBe(4001);
    const cut = limitContext(text);
    expect(cut).toBe("z".repeat(3999));
    expect(cut).not.toMatch(LONE_SURROGATE);
  });

  it("states the self-represented drafting role and the no-invention rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/self-represented/);
    expect(SYSTEM_PROMPT).toMatch(/not invent citations/);
  });

  it("asks for plain prose with no Markdown, headings, lists, emphasis marks or title line", () => {
    expect(SYSTEM_PROMPT).toMatch(/plain prose only/);
    expect(SYSTEM_PROMPT).toMatch(/no Markdown, no headings, no bullet or numbered lists/);
    expect(SYSTEM_PROMPT).toMatch(/no asterisks or underscores for emphasis, and no title line/);
    expect(SYSTEM_PROMPT).toMatch(/Begin directly with the paragraph/);
  });
  it("sends an adapter only the system prompt, the prompt and the limited paragraph", async () => {
    const seen: AdapterInput[] = [];
    const streamText: StreamTextFn = () => ({ textStream: oneChunk("unused") });
    const config: AssistantConfig = { bedrock: BEDROCK, anthropic: ANTHROPIC };
    const adapter = (input: AdapterInput): AsyncIterable<string> => {
      seen.push(input);
      return oneChunk("ok");
    };
    const parts = await collect(
      draft("write it", "q".repeat(5000), { config, streamText, adapters: { bedrock: adapter } }),
    );
    expect(parts).toEqual(["ok"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.provider).toEqual({ name: "bedrock", modelId: "bedrock-model-x" });
    expect(seen[0]?.system).toBe(SYSTEM_PROMPT);
    expect(seen[0]?.prompt).toBe(
      `Paragraph at the cursor:\n${"q".repeat(4000)}\n\nRequest:\nwrite it`,
    );
  });

  it("rejects with a generic error when the selected adapter is not installed", async () => {
    const config: AssistantConfig = { bedrock: null, anthropic: ANTHROPIC };
    await expect(collect(draft("p", "", { config }))).rejects.toThrow(
      "assistant provider is not available",
    );
  });
});

describe("static: no hard-coded model id _Requirements: 22.3_", () => {
  const files = ["deps.ts", "llm.ts", "llm-fixture.ts"];
  const MODEL_ID =
    /claude-|anthropic\.claude|amazon\.(?:nova|titan)|\b(?:sonnet|haiku|opus)\b|us\.anthropic|eu\.anthropic/i;
  for (const file of files) {
    it(`${file} holds no model id literal`, () => {
      const url = new URL(`../src/server/${file}`, import.meta.url);
      expect(readFileSync(fileURLToPath(url), "utf8")).not.toMatch(MODEL_ID);
    });
  }
});
