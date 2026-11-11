import { streamText } from "ai";
import type { LanguageModel } from "ai";
import { anthropicAdapter } from "./llm-anthropic";
import { bedrockAdapter } from "./llm-bedrock";
import type { DraftOptions, StreamTextFn } from "./llm";

export const STREAM_FAILED = "assistant provider failed";

/**
 * The SDK's `textStream` drops error parts, and its default `onError` logs the
 * provider's message. Record the failure silently and raise a fixed error when the
 * stream ends, so a failure before the first chunk reaches the route as a failure.
 */
export const sdkStreamText: StreamTextFn = (options) => {
  let failed = false;
  const result = streamText({
    model: options.model as LanguageModel,
    instructions: options.system,
    prompt: options.prompt,
    ...(options.maxOutputTokens === undefined ? {} : { maxOutputTokens: options.maxOutputTokens }),
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    onError: () => {
      failed = true;
    },
  });
  async function* checked(): AsyncGenerator<string, void, undefined> {
    yield* result.textStream;
    if (failed && options.abortSignal?.aborted !== true) throw new Error(STREAM_FAILED);
  }
  return { textStream: checked() };
};

/** Real SDK wiring. With no provider configured, `draft` never reaches these and uses the fixture. */
export const defaultDraftOptions: DraftOptions = {
  streamText: sdkStreamText,
  adapters: { bedrock: bedrockAdapter, anthropic: anthropicAdapter },
};
