import type { CallerOperation, Document } from "@reveal-codes/engine";
import type { AssistantInfo } from "./client/api";
import { lineAt } from "./pane/layout";
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

/** The number in an `r<digits>` id, else 0. */
function runNumber(runId: string): number {
  const match = /^r(\d+)$/.exec(runId);
  return match === null ? 0 : Number(match[1]);
}

/**
 * `r<N>`, N one more than the largest of the Engine run count, the Run_Log length and the
 * highest `r<digits>` number in either list (L2). The last term keeps a restored Document
 * with an empty Run_Log from reusing an id.
 */
export function nextRunId(document: Document, runLog: readonly RunLogEntry[]): string {
  const highest = Math.max(
    document.runs.length,
    runLog.length,
    ...document.runs.map((run) => runNumber(run.runId)),
    ...runLog.map((run) => runNumber(run.runId)),
  );
  return `r${String(highest + 1)}`;
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

/** The reply as its own paragraph: a `\n` before it unless the caret starts a paragraph, after it unless the caret ends one. */
function asParagraph(reply: string, text: string, at: number): string {
  const body = reply.replace(/^\n+|\n+$/g, "");
  if (body === "") return reply;
  const atStart = at === 0 || text[at - 1] === "\n";
  const atEnd = at === text.length || text[at] === "\n";
  return (atStart ? "" : "\n") + body + (atEnd ? "" : "\n");
}

/**
 * Line of the first inserted character: the line of `op.at` in the text before the edit, plus one
 * when the insert starts with the separating newline `asParagraph` adds.
 */
export function insertionLine(docText: string, op: Readonly<{ at: number; text: string }>): number {
  return lineAt(docText, op.at) + (op.text.startsWith("\n") ? 1 : 0);
}

/** One `AI` insert at the caret and its Run_Log entry; the app never builds `AI>HUM`. */
export function buildInsertion(input: InsertionInput): Insertion {
  const runId = nextRunId(input.document, input.runLog);
  const docText = input.document.text;
  const at = Math.max(0, Math.min(input.caret, docText.length));
  const op: CallerOperation = {
    kind: "insert",
    at,
    text: asParagraph(normaliseNewlines(input.text), docText, at),
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
