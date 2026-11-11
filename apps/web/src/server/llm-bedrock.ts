import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { MAX_OUTPUT_TOKENS } from "./llm";
import type { AdapterInput, ProviderAdapter } from "./llm";

/** Tier 2. The model id and region come only from configuration; no id is written here. */
export type BedrockModelFactory = (settings: { region: string }) => (modelId: string) => unknown;

export const BEDROCK_FAILED = "assistant provider failed";

/**
 * Builds the Bedrock adapter. The factory is a seam so tests can see which id and
 * region the model was built from without the SDK or any network.
 */
export function createBedrockAdapter(factory: BedrockModelFactory): ProviderAdapter {
  return async function* bedrockAdapter(
    input: AdapterInput,
  ): AsyncGenerator<string, void, undefined> {
    const settings = input.config.bedrock;
    if (settings === null) throw new Error(BEDROCK_FAILED);
    try {
      const model = factory({ region: settings.region })(settings.modelId);
      const result = input.streamText({
        model,
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      });
      yield* result.textStream;
    } catch {
      // Provider text can carry request details; callers get a fixed message only.
      throw new Error(BEDROCK_FAILED);
    }
  };
}

export const bedrockAdapter: ProviderAdapter = createBedrockAdapter((settings) =>
  createAmazonBedrock(settings),
);
