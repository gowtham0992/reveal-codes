import type { ServerConfig } from "./deps";
import { jsonResponse } from "./http";
import { selectProvider } from "./llm";

/**
 * Reads `mode` and the provider name and model id only. The token, paths, region
 * and API key in the config never reach the response.
 */
export function handleMode(config: ServerConfig): Response {
  const provider = selectProvider(config.assistant);
  return jsonResponse(200, {
    mode: config.mode,
    assistant: { provider: provider.name, modelId: provider.modelId },
  });
}
