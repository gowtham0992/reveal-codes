import { STDIN_MAX } from "./limits.js";
import type { Payload } from "./types.js";

const EMPTY: Payload = {
  sessionId: null,
  cwd: null,
  taskName: null,
  specName: null,
  taskSuccess: null,
};

function emptyPayload(): Payload {
  return { ...EMPTY };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** True when the UTF-8 encoding of `text` is longer than STDIN_MAX bytes (Req 3.15). */
function overLimit(text: string): boolean {
  if (text.length > STDIN_MAX) return true;
  return new TextEncoder().encode(text).length > STDIN_MAX;
}

/**
 * The name of the directory that holds the `tasks.md` named by `spec_name`.
 * Only a directory name survives: no separator and no absolute path (Req 3.19).
 * A value that is not a path to `tasks.md` is reduced to its last segment.
 */
function specDirectoryName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split(/[\\/]/).filter((part) => part !== "");
  if (parts[parts.length - 1] === "tasks.md") parts.pop();
  const name = parts[parts.length - 1];
  return name === undefined || name === "" || name === ".." || name === "." ? null : name;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Invalid JSON (or nesting too deep to parse) is the defined case: empty payload, never a throw.
    return null;
  }
}

/**
 * Keep `session_id`, `cwd`, `task_name`, `spec_name` and `task_success` of a
 * hook payload and nothing else (Req 3.15, 3.16, 3.19, 3.22). A text that is
 * over 1 MiB, not JSON or not an object gives the empty payload. The fields
 * `prompt`, `tool_input` and `tool_response` are never read. Never throws.
 */
export function parsePayload(text: string): Payload {
  if (typeof text !== "string" || overLimit(text)) return emptyPayload();
  const value = parseJson(text);
  if (!isRecord(value)) return emptyPayload();
  const sessionId = stringOrNull(value["session_id"]);
  const success = value["task_success"];
  return {
    sessionId: sessionId === "" ? null : sessionId,
    cwd: stringOrNull(value["cwd"]),
    taskName: stringOrNull(value["task_name"]),
    specName: specDirectoryName(value["spec_name"]),
    taskSuccess: typeof success === "boolean" ? success : null,
  };
}
