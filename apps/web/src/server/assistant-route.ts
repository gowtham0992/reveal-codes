import type { AssistantConfig } from "./deps";
import { readBodyCapped } from "./body";
import { ASSISTANT_BUSY } from "../notices";
import { NO_STORE, jsonResponse } from "./http";
import { draft, selectProvider } from "./llm";
import type { DraftOptions } from "./llm";
import { clientAddress } from "./rate-limit";
import type { Limiter } from "./rate-limit";

/** Tier 2. Prompt and context are small; anything past this is rejected before parsing. */
export const MAX_ASSISTANT_BODY_BYTES = 65_536;
export const MAX_PROMPT = 2000;
export const MAX_CONTEXT = 4000;

export type AssistantRequest = Readonly<{ prompt: string; context: string }>;
export type AssistantRouteError = Readonly<{ status: 400 | 413; message: string }>;
export type ParsedAssistantBody =
  | Readonly<{ ok: true; value: AssistantRequest }>
  | Readonly<{ ok: false; error: AssistantRouteError }>;

/** Fixed messages: none echoes input, a credential or provider text. */
export const BAD_BODY: AssistantRouteError = { status: 400, message: "Request body is not valid." };
export const TOO_LARGE: AssistantRouteError = { status: 413, message: "Request is too large." };
export const PROVIDER_FAILED = "The assistant is not available right now.";

const encoder = new TextEncoder();

function fail(error: AssistantRouteError): ParsedAssistantBody {
  return { ok: false, error };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    return error;
  }
}

/** Exactly `{ prompt, context }`: a trimmed prompt of 1 to 2 000 characters, a context of at most 4 000. */
export function parseAssistantBody(text: string): ParsedAssistantBody {
  const body = parseJson(text);
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail(BAD_BODY);
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const { prompt, context } = record;
  if (keys.length !== 2 || keys[0] !== "context" || keys[1] !== "prompt") return fail(BAD_BODY);
  if (typeof prompt !== "string" || typeof context !== "string") return fail(BAD_BODY);
  const trimmed = prompt.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_PROMPT) return fail(BAD_BODY);
  if (context.length > MAX_CONTEXT) return fail(BAD_BODY);
  return { ok: true, value: { prompt: trimmed, context } };
}

/** Splits off a trailing high surrogate so a pair cut by the provider is never encoded alone. */
function splitHeldSurrogate(text: string): readonly [string, string] {
  const code = text.length === 0 ? 0 : text.charCodeAt(text.length - 1);
  if (code >= 0xd800 && code <= 0xdbff) return [text.slice(0, -1), text.slice(-1)];
  return [text, ""];
}

type Puller = () => Promise<string | null>;

/** Next non-empty text to emit, or `null` at the end. A dangling high surrogate at the end is dropped. */
function createPuller(iterator: AsyncIterator<string>): Puller {
  let held = "";
  return async () => {
    for (;;) {
      const step = await iterator.next();
      if (step.done === true) return null;
      const [emit, rest] = splitHeldSurrogate(held + step.value);
      held = rest;
      if (emit !== "") return emit;
    }
  };
}

/** Turns a rejection into a value so the route can answer with a fixed message. */
async function attempt<T>(run: () => Promise<T>): Promise<T | Error> {
  try {
    return await run();
  } catch (error) {
    return error instanceof Error ? error : new Error("assistant failed");
  }
}

type Stream = Readonly<{
  iterator: AsyncIterator<string>;
  abort: AbortController;
  first: string | null;
}>;

function bodyStream(stream: Stream, pull: Puller): ReadableStream<Uint8Array> {
  const stop = (): void => {
    stream.abort.abort();
    void stream.iterator.return?.().catch(() => undefined);
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (stream.first === null) controller.close();
      else controller.enqueue(encoder.encode(stream.first));
    },
    async pull(controller) {
      const next = await attempt(pull);
      if (next instanceof Error) {
        stop();
        controller.error(new Error(PROVIDER_FAILED));
      } else if (next === null) controller.close();
      else controller.enqueue(encoder.encode(next));
    },
    cancel: stop,
  });
}

function linkAbort(request: Request, abort: AbortController): void {
  if (request.signal.aborted) abort.abort();
  else {
    request.signal.addEventListener(
      "abort",
      () => {
        abort.abort();
      },
      { once: true },
    );
  }
}

/** 429 with Retry-After when a live provider is configured and the address is over its limit. */
function overLimit(
  request: Request,
  assistant: AssistantConfig,
  limiter: Limiter | undefined,
): Response | null {
  if (limiter === undefined || selectProvider(assistant).name === "fixture") return null;
  const decision = limiter.check(clientAddress(request.headers));
  if (decision.allowed) return null;
  return new Response(JSON.stringify({ error: ASSISTANT_BUSY }), {
    status: 429,
    headers: {
      ...NO_STORE,
      "Retry-After": String(decision.retryAfterSeconds),
      "Content-Type": "application/json",
    },
  });
}
/**
 * Validates, pulls the first chunk (so a failure before it is a 502), then streams
 * `text/plain` with `no-store`. Client disconnect aborts the provider call.
 */
export async function handleAssistant(
  request: Request,
  assistant: AssistantConfig,
  options: DraftOptions = {},
  limiter?: Limiter,
): Promise<Response> {
  const limited = overLimit(request, assistant, limiter);
  if (limited !== null) return limited;
  const body = await readBodyCapped(request, MAX_ASSISTANT_BODY_BYTES);
  if (!body.ok) return jsonResponse(TOO_LARGE.status, { error: TOO_LARGE.message });
  const parsed = parseAssistantBody(body.text);
  if (!parsed.ok) return jsonResponse(parsed.error.status, { error: parsed.error.message });
  const abort = new AbortController();
  linkAbort(request, abort);
  const source = draft(parsed.value.prompt, parsed.value.context, {
    ...options,
    config: assistant,
    signal: abort.signal,
  });
  const iterator = source[Symbol.asyncIterator]();
  const pull = createPuller(iterator);
  const first = await attempt(pull);
  if (first instanceof Error) {
    abort.abort();
    return jsonResponse(502, { error: PROVIDER_FAILED });
  }
  const stream = bodyStream({ iterator, abort, first }, pull);
  return new Response(stream, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}
