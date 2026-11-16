/**
 * Field decoders for Payload_Section values (design A12 step 2; Req 20.3).
 *
 * The lexer has already checked key presence, duplicates, and escapes. These
 * readers check value types. Each returns `ok(undefined)` for an absent
 * optional key, `ok(value)` for a well-typed one, and `err(BAD)` for a value
 * that cannot be decoded into its field type (rule `bad_field`).
 */
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import type { Declaration } from "../declaration.js";
import type { RunEntry } from "../types.js";
import { isTimestamp } from "../validate.js";
import { DECLARATION_KEY, decodeDeclaration } from "./doc-declaration.js";
import type { CodeToken } from "./lex.js";

export const BAD = "bad" as const;
export type Read<T> = Result<T | undefined, typeof BAD>;

const INT_RE = /^(0|[1-9][0-9]*)$/;
const KEY_RE = /^k(0|[1-9][0-9]*)$/;

/** Canonical non-negative decimal integer (no sign, no leading zeros). */
export function decodeInt(s: string): number | undefined {
  if (!INT_RE.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

function valuesOf(code: CodeToken, key: string): readonly string[] | undefined {
  return code.fields.find((f) => f.key === key)?.values;
}

function single<T>(code: CodeToken, key: string, parse: (s: string) => T | undefined): Read<T> {
  const values = valuesOf(code, key);
  if (values === undefined) return ok(undefined);
  const only = values.length === 1 ? values[0] : undefined;
  const parsed = only === undefined ? undefined : parse(only);
  return parsed === undefined ? err(BAD) : ok(parsed);
}

export const readText = (code: CodeToken, key: string): Read<string> => single(code, key, (s) => s);

export const readInt = (code: CodeToken, key: string): Read<number> => single(code, key, decodeInt);

export const readTimestamp = (code: CodeToken, key: string): Read<string> =>
  single(code, key, (s) => (isTimestamp(s) ? s : undefined));

export const readKey = (code: CodeToken, key: string): Read<string> =>
  single(code, key, (s) => (KEY_RE.test(s) ? s : undefined));

/** A comma list with at least one value. */
export function readList(code: CodeToken, key: string): Read<readonly string[]> {
  const values = valuesOf(code, key);
  return values === undefined || values.length === 0 ? ok(undefined) : ok(values);
}

/** The `v` field of `[DOC]`: exactly `1`. */
export function readVersion(code: CodeToken): Read<1> {
  return single(code, "v", (s) => (s === "1" ? 1 : undefined));
}

/** The `d` field of `[DOC]`: absent is `ok(undefined)`; any malformed value is `err(BAD)`. */
export function readDeclaration(code: CodeToken): Read<Declaration> {
  const values = valuesOf(code, DECLARATION_KEY);
  if (values === undefined) return ok(undefined);
  const declaration = decodeDeclaration(values);
  return declaration === undefined ? err(BAD) : ok(declaration);
}

function decodeRun(values: readonly string[]): RunEntry | undefined {
  const [runId, orig, edited, flag] = values;
  if (values.length !== 4 || runId === undefined) return undefined;
  const originalLength = decodeInt(orig ?? "");
  const editedCount = decodeInt(edited ?? "");
  if (originalLength === undefined || editedCount === undefined) return undefined;
  if (flag !== "0" && flag !== "1") return undefined;
  return { runId, originalLength, editedCount, relabelled: flag === "1" };
}

/** Every `r=` field of `[DOC]`, in input order; `undefined` if any is undecodable. */
export function readRuns(code: CodeToken): readonly RunEntry[] | undefined {
  const runs: RunEntry[] = [];
  for (const f of code.fields) {
    if (f.key !== "r") continue;
    const run = decodeRun(f.values);
    if (run === undefined) return undefined;
    runs.push(run);
  }
  return runs;
}
