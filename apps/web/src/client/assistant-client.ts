import type { Result } from "@reveal-codes/engine";
import type { ApiError, FetchFn } from "./api";

/** Turns a rejection into a value so callers branch on it instead of catching. */
async function attempt<T>(run: () => Promise<T>): Promise<T | Error> {
  try {
    return await run();
  } catch (error) {
    return error instanceof Error ? error : new Error("request failed");
  }
}

const NETWORK: Result<void, ApiError> = { ok: false, error: { kind: "network" } };

async function readChunks(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<Result<void, ApiError>> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  for (;;) {
    const step = await attempt(() => reader.read());
    if (step instanceof Error) return NETWORK;
    if (step.done) break;
    const text = decoder.decode(step.value, { stream: true });
    if (text !== "") onChunk(text);
  }
  const rest = decoder.decode();
  if (rest !== "") onChunk(rest);
  return { ok: true, value: undefined };
}

/** The route's fixed `{ error }` sentence of a 429, so the panel can tell a busy address from the hourly limit. */
async function refusal(response: Response): Promise<Result<void, ApiError>> {
  const status = response.status;
  if (status !== 429) return { ok: false, error: { kind: "status", status } };
  const body = await attempt(() => response.json() as Promise<unknown>);
  const message = body instanceof Error ? undefined : errorOf(body);
  return {
    ok: false,
    error: { kind: "status", status, ...(message === undefined ? {} : { message }) },
  };
}
function errorOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const error = (body as Record<string, unknown>)["error"];
  return typeof error === "string" ? error : undefined;
}
/**
 * `POST /api/assistant`, reading the reply as it arrives and passing each decoded
 * piece to `onChunk`. A multi-byte character split across reads is held until whole.
 * Never throws: abort, a dropped connection and a non-2xx status come back as values.
 */
export async function streamDraft(
  fetchFn: FetchFn,
  prompt: string,
  context: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<Result<void, ApiError>> {
  const init = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, context }),
    ...(signal === undefined ? {} : { signal }),
  };
  const response = await attempt(() => fetchFn("/api/assistant", init));
  if (response instanceof Error) return NETWORK;
  if (!response.ok) return refusal(response);
  if (response.body === null) return { ok: false, error: { kind: "shape" } };
  return readChunks(response.body, onChunk);
}
