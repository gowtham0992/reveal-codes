import type { ServerConfig } from "./deps";
import { jsonResponse } from "./http";

/** Reads only `mode`; the token and paths in the config never reach the response. */
export function handleMode(config: ServerConfig): Response {
  return jsonResponse(200, { mode: config.mode });
}
