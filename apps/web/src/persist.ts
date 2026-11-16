import { err, isDeclaration, ok, parse, render } from "@reveal-codes/engine";
import type { Declaration, Document, Result } from "@reveal-codes/engine";
import type { RunLogEntry } from "./store";

export const AUTOSAVE_KEY = "reveal-codes:document:v1";

export type PersistedValue = Readonly<{
  version: 1;
  codes: string;
  runLog: readonly RunLogEntry[];
  verifiedAt: string | null;
  /** Absent when the author has made no declaration. Version stays 1. */
  declaration?: Declaration;
}>;

export type PersistError = Readonly<{ kind: "absent" | "not_json" | "bad_shape" | "bad_codes" }>;

export type Restored = Readonly<{
  document: Document;
  runLog: readonly RunLogEntry[];
  verifiedAt: string | null;
  declaration: Declaration | null;
}>;

/** The Persisted_Value as JSON. Undo and Redo stacks and Notices are not inputs (Req 9.7). */
export function serialise(
  document: Document,
  runLog: readonly RunLogEntry[],
  verifiedAt: string | null,
  declaration: Declaration | null,
): string {
  const value: PersistedValue = {
    version: 1,
    codes: render(document, "full").text,
    runLog,
    verifiedAt,
    ...(declaration === null ? {} : { declaration }),
  };
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRunLogEntry(value: unknown): RunLogEntry | null {
  if (!isRecord(value)) return null;
  const { runId, provider, modelId, prompt, timestamp } = value;
  if (typeof runId !== "string" || typeof provider !== "string") return null;
  if (typeof prompt !== "string" || typeof timestamp !== "string") return null;
  if (modelId !== null && typeof modelId !== "string") return null;
  return { runId, provider, modelId, prompt, timestamp };
}

function asRunLog(value: unknown): readonly RunLogEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries: RunLogEntry[] = [];
  for (const item of value as readonly unknown[]) {
    const entry = asRunLogEntry(item);
    if (entry === null) return null;
    entries.push(entry);
  }
  return entries;
}

function parseJson(raw: string): Result<unknown, PersistError> {
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return err({ kind: "not_json" });
  }
}

export type Stored = Readonly<{ raw: string | null } | { thrown: unknown }>;

/** `localStorage` access can throw (disabled storage); the throw becomes a value. */
export function readRaw(storage: Pick<Storage, "getItem">, key: string): Stored {
  try {
    return { raw: storage.getItem(key) };
  } catch (e) {
    return { thrown: e };
  }
}

/** An absent or unreadable Declaration is `null`; it never fails the load. */
function readDeclaration(value: unknown): Declaration | null {
  return isDeclaration(value) ? value : null;
}

/** Validates the JSON shape, then the Engine's `parse`; any fault is an `Err` (Req 9.4). */
export function deserialise(raw: string | null): Result<Restored, PersistError> {
  if (raw === null) return err({ kind: "absent" });
  const json = parseJson(raw);
  if (!json.ok) return json;
  const value = json.value;
  if (!isRecord(value) || value["version"] !== 1) return err({ kind: "bad_shape" });
  const codes = value["codes"];
  const runLog = asRunLog(value["runLog"]);
  const stamp = value["verifiedAt"];
  if (typeof codes !== "string" || runLog === null) return err({ kind: "bad_shape" });
  if (stamp !== undefined && stamp !== null && typeof stamp !== "string") {
    return err({ kind: "bad_shape" });
  }
  const parsed = parse(codes);
  if (!parsed.ok) return err({ kind: "bad_codes" });
  return ok({ document: parsed.value, runLog, verifiedAt: stamp ?? null,
    declaration: readDeclaration(value["declaration"]),
  });
}

/** True only when the stored draft restores to a Document whose text is not empty. */
export function savedDraftExists(storage: Pick<Storage, "getItem">): boolean {
  const stored = readRaw(storage, AUTOSAVE_KEY);
  if (!("raw" in stored)) return false;
  const restored = deserialise(stored.raw);
  return restored.ok && restored.value.document.text.length > 0;
}
