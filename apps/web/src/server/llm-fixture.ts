import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Tier 2. Recorded-response provider: used when no LLM credentials are set. */
export const CHUNK_SIZE = 64;

/** Reads `<name>` from the fixtures directory; `null` when the file does not exist. */
export type FixtureReader = (name: string) => Promise<string | null>;

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/** First 16 hex digits of SHA-256 of the trimmed prompt with whitespace runs collapsed to one space. */
export function promptHash(prompt: string): string {
  const normal = prompt.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normal, "utf8").digest("hex").slice(0, 16);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Chunks of at most `max` code units that concatenate to `text`; a surrogate pair is never split. */
export function chunkText(text: string, max: number): readonly string[] {
  if (!Number.isInteger(max) || max < 2)
    throw new RangeError("max must be an integer of 2 or more");
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + max, text.length);
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) end -= 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/**
 * Looks in each directory in order. The default directories cover the web app
 * as the working directory (Next) and the repository root (tests, scripts).
 */
export function createFixtureReader(
  dirs: readonly string[] = defaultFixtureDirs(process.cwd()),
): FixtureReader {
  return async (name) => {
    for (const dir of dirs) {
      const text = await readFile(join(dir, name), "utf8").catch((error: unknown) => {
        if (isMissing(error)) return null;
        throw error;
      });
      if (text !== null) return text;
    }
    return null;
  };
}

export function defaultFixtureDirs(cwd: string): readonly string[] {
  return [join(cwd, "fixtures", "assistant"), join(cwd, "apps", "web", "fixtures", "assistant")];
}

/** Yields `<hash>.txt` for the prompt, else `default.txt`, in chunks of at most 64 characters. */
export async function* fixtureStream(
  prompt: string,
  read: FixtureReader,
): AsyncGenerator<string, void, undefined> {
  const text = (await read(`${promptHash(prompt)}.txt`)) ?? (await read("default.txt"));
  if (text === null) throw new Error("assistant fixture default.txt is missing");
  for (const chunk of chunkText(text, CHUNK_SIZE)) yield chunk;
}
