import { createAnthropic } from "@ai-sdk/anthropic";
import type { AdapterInput, ProviderAdapter } from "./llm";

/** Tier 2. The model id and key come only from configuration; no id is written here. */
export type AnthropicModelFactory = (settings: { apiKey: string }) => (modelId: string) => unknown;

export const ANTHROPIC_FAILED = "assistant provider failed";

/**
 * Builds the Anthropic adapter. The factory is a seam so tests can see which id and
 * key the model was built from without the SDK or any network. The key is never logged.
 */
export function createAnthropicAdapter(factory: AnthropicModelFactory): ProviderAdapter {
  return async function* anthropicAdapter(
    input: AdapterInput,
  ): AsyncGenerator<string, void, undefined> {
    const settings = input.config.anthropic;
    if (settings === null) throw new Error(ANTHROPIC_FAILED);
    try {
      const model = factory({ apiKey: settings.apiKey })(settings.modelId);
      const result = input.streamText({
        model,
        system: input.system,
        prompt: input.prompt,
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      });
      yield* result.textStream;
    } catch {
      // Provider text can carry request details; callers get a fixed message only.
      throw new Error(ANTHROPIC_FAILED);
    }
  };
}

export const anthropicAdapter: ProviderAdapter = createAnthropicAdapter((settings) =>
  createAnthropic(settings),
);
