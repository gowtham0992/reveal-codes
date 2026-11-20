import { STDIN_MAX, STDIN_WAIT_MS } from "../core/limits.js";
import type { Deps } from "./deps.js";

type Gate = { stopped: boolean };

/** All chunks, or null when the input is over STDIN_MAX, stopped, or fails. */
async function collect(source: AsyncIterable<Uint8Array>, gate: Gate): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of source) {
      if (gate.stopped) return null;
      total += chunk.length;
      if (total > STDIN_MAX) return null;
      chunks.push(chunk);
    }
  } catch {
    // A broken input stream is the "continue with the empty payload" case (design, Error Handling).
    return null;
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.length;
  }
  return all;
}

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Invalid UTF-8 is not a payload: continue with the empty one.
    return "";
  }
}

/**
 * Reads standard input for at most 1.5 s and 1 MiB (Req 3.15). Returns the
 * text, or the empty string when the input did not close in time, is empty,
 * is not UTF-8, or is too large; the caller then uses the empty payload.
 */
export async function readStdin(deps: Pick<Deps, "stdin" | "clock">): Promise<string> {
  const gate: Gate = { stopped: false };
  const timer = deps.clock.timer(STDIN_WAIT_MS);
  const reading = collect(deps.stdin, gate);
  const bytes = await Promise.race([reading, timer.done.then(() => null)]);
  timer.cancel();
  gate.stopped = true;
  return bytes === null ? "" : decode(bytes);
}
