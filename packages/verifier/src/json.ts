import { err, ok } from "@reveal-codes/engine";
import type { Result } from "@reveal-codes/engine";

export type JsonError = Readonly<{ kind: "json" }>;

/** The only `try/catch` in `src/`: a parse failure is returned as a value (Req 15.6). */
export function parseJson(text: string): Result<unknown, JsonError> {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch {
    return err({ kind: "json" });
  }
}

export function isRecord(v: unknown): v is Readonly<Record<string, unknown>> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The array itself, or `null` when `v` is not an array. */
export function asArray(v: unknown): readonly unknown[] | null {
  return Array.isArray(v) ? (v as readonly unknown[]) : null;
}
