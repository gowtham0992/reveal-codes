/**
 * The shape of a tool result and the two ways to make one (Req 12.3, 12.8): structured content
 * with a text summary of one to five lines, or an error result with one message. Every string
 * that reaches a result passes through `neutralize`, so no control character or ANSI sequence
 * leaves the server.
 */
import { neutralize } from "../core/neutralize.js";
export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: true;
};
const MAX_LINES = 5;
/** `value` with every string neutralized, at any depth. Numbers, booleans and null are unchanged. */
export function cleanStrings(value: unknown): unknown {
  if (typeof value === "string") return neutralize(value);
  if (Array.isArray(value)) return value.map(cleanStrings);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanStrings(v)]));
  }
  return value;
}
function textOf(lines: readonly string[], limit: number): { type: "text"; text: string }[] {
  return [{ type: "text", text: lines.slice(0, limit).map(neutralize).join("\n") }];
}
/**
 * A result with structured content and at most `limit` lines of text (five, Req 12.3, unless the
 * caller lifts it: `setup_provenance` names every file, Req 12.9). `error` marks `isError`.
 */
export function okResult(
  structured: object,
  lines: readonly string[],
  error = false,
  limit = MAX_LINES,
): ToolResult {
  const body = cleanStrings(structured) as Record<string, unknown>;
  const base = { content: textOf(lines, limit), structuredContent: body };
  return error ? { ...base, isError: true } : base;
}
/** An error result: one line of text, no structured content. */
export function errorResult(message: string): ToolResult {
  return { content: textOf([message], 1), isError: true };
}
