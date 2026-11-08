import type { CallerOperation, Document } from "@reveal-codes/engine";
import type { AssistantInfo } from "./client/api";
import type { RunLogEntry } from "./store";

/** The route accepts at most this many code units of context (Requirement 22.8). */
export const CONTEXT_LIMIT = 4000;
/** The route accepts a trimmed prompt of at most this many characters (Requirement 22.8). */
export const PROMPT_LIMIT = 2000;

const PROVIDER_NAMES = { bedrock: "Amazon Bedrock", anthropic: "Anthropic" } as const;

/** The disclosure sentence of Requirement 23.1. */
export function disclosure(info: AssistantInfo): string {
  if (info.provider === "fixture") {
    return "Demo mode: replies are recorded and nothing is sent to a model.";
  }
  return `Draft sends your prompt and the paragraph at the cursor to ${PROVIDER_NAMES[info.provider]}.`;
}

/** The paragraph (text between newlines) holding `offset`, cut to its last 4 000 code units. */
export function paragraphAt(text: string, offset: number): string {
  const at = Math.max(0, Math.min(offset, text.length));
  const start = text.lastIndexOf("\n", at - 1) + 1;
  const found = text.indexOf("\n", at);
  const paragraph = text.slice(start, found === -1 ? text.length : found);
  if (paragraph.length <= CONTEXT_LIMIT) return paragraph;
  const cut = paragraph.slice(paragraph.length - CONTEXT_LIMIT);
  const first = cut.charCodeAt(0);
  // Never start on the low half of a surrogate pair.
  return first >= 0xdc00 && first <= 0xdfff ? cut.slice(1) : cut;
}

export function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** `r<N>`, N one more than the larger of the Engine run count and the Run_Log length (L2). */
export function nextRunId(document: Document, runLog: readonly RunLogEntry[]): string {
  return `r${String(Math.max(document.runs.length, runLog.length) + 1)}`;
}

export type Insertion = Readonly<{ ops: readonly CallerOperation[]; run: RunLogEntry }>;

export type InsertionInput = Readonly<{
  document: Document;
  runLog: readonly RunLogEntry[];
  caret: number;
  text: string;
  prompt: string;
  info: AssistantInfo;
  timestamp: string;
}>;

/** One `AI` insert at the caret and its Run_Log entry; the app never builds `AI>HUM`. */
export function buildInsertion(input: InsertionInput): Insertion {
  const runId = nextRunId(input.document, input.runLog);
  const at = Math.max(0, Math.min(input.caret, input.document.text.length));
  const op: CallerOperation = {
    kind: "insert",
    at,
    text: normaliseNewlines(input.text),
    provenance: { origin: "AI", runId, timestamp: input.timestamp },
  };
  const run: RunLogEntry = {
    runId,
    provider: input.info.provider,
    modelId: input.info.modelId,
    prompt: input.prompt,
    timestamp: input.timestamp,
  };
  return { ops: [op], run };
}
