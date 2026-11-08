import type { AssistantConfig } from "./deps";
import { createFixtureReader, fixtureStream } from "./llm-fixture";
import type { FixtureReader } from "./llm-fixture";

/**
 * Tier 2 provider seam. This module imports no provider SDK: the Bedrock and
 * Anthropic adapters (llm-bedrock.ts, llm-anthropic.ts) plug in through
 * `DraftOptions.adapters`, and no model id appears here; ids come from config.
 */
export type ProviderName = "bedrock" | "anthropic" | "fixture";
export type Provider = Readonly<{ name: ProviderName; modelId: string | null }>;

export type StreamTextFn = (
  options: Readonly<{
    model: unknown;
    system: string;
    prompt: string;
    abortSignal?: AbortSignal;
  }>,
) => Readonly<{ textStream: AsyncIterable<string> }>;

export type AdapterInput = Readonly<{
  provider: Provider;
  config: AssistantConfig;
  streamText: StreamTextFn;
  system: string;
  prompt: string;
  signal?: AbortSignal;
}>;
export type ProviderAdapter = (input: AdapterInput) => AsyncIterable<string>;

export type DraftOptions = Readonly<{
  config?: AssistantConfig;
  streamText?: StreamTextFn;
  signal?: AbortSignal;
  adapters?: Readonly<Partial<Record<"bedrock" | "anthropic", ProviderAdapter>>>;
  readFixture?: FixtureReader;
}>;

export const CONTEXT_LIMIT = 4000;

export const SYSTEM_PROMPT = [
  "You are helping draft a court filing for a self-represented person who has no lawyer.",
  "Write plain, careful prose for the paragraph requested.",
  "Do not invent citations: never cite a case, statute or rule unless the user's text gives it.",
  "If authority is needed, write a bracketed note such as [citation needed] instead.",
  "Do not give legal advice and do not state what the law is.",
].join(" ");

const NO_PROVIDERS: AssistantConfig = { bedrock: null, anthropic: null };

/** Pure: Bedrock, else Anthropic, else the recorded-response provider. */
export function selectProvider(config: AssistantConfig): Provider {
  if (config.bedrock !== null) return { name: "bedrock", modelId: config.bedrock.modelId };
  if (config.anthropic !== null) return { name: "anthropic", modelId: config.anthropic.modelId };
  return { name: "fixture", modelId: null };
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** The last 4 000 code units, dropping a low surrogate left at the cut so no pair is split. */
export function limitContext(context: string): string {
  if (context.length <= CONTEXT_LIMIT) return context;
  const tail = context.slice(context.length - CONTEXT_LIMIT);
  return isLowSurrogate(tail.charCodeAt(0)) ? tail.slice(1) : tail;
}

function buildPrompt(prompt: string, context: string): string {
  const paragraph = limitContext(context);
  if (paragraph === "") return prompt;
  return `Paragraph at the cursor:\n${paragraph}\n\nRequest:\n${prompt}`;
}

function missingStreamText(): never {
  throw new Error("assistant provider is not available");
}

function viaAdapter(
  provider: Provider,
  adapter: ProviderAdapter | undefined,
  base: Omit<AdapterInput, "provider" | "streamText">,
  streamText: StreamTextFn | undefined,
): AsyncIterable<string> {
  if (adapter === undefined || streamText === undefined) return missingStreamText();
  return adapter({ ...base, provider, streamText });
}

/**
 * Streams a reply. Sends only the prompt and the (limited) paragraph context,
 * never the Document. The fixture provider needs no credentials or network.
 */
export async function* draft(
  prompt: string,
  context: string,
  options: DraftOptions = {},
): AsyncGenerator<string, void, undefined> {
  const config = options.config ?? NO_PROVIDERS;
  const provider = selectProvider(config);
  if (provider.name === "fixture") {
    yield* fixtureStream(prompt, options.readFixture ?? createFixtureReader());
    return;
  }
  const base = {
    config,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(prompt, context),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  yield* viaAdapter(provider, options.adapters?.[provider.name], base, options.streamText);
}
