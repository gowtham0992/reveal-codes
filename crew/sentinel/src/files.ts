import type { Result } from "@reveal-codes/engine";
import { promises } from "node:fs";
import type { SentinelError } from "./types.js";

export type PathKind = "directory" | "file" | "missing" | "other";

export type FilePort = Readonly<{
  kind(path: string): Promise<PathKind>;
  /** Names of the entries of `dir` that are not directories. Rejects if `dir` cannot be listed. */
  list(dir: string): Promise<readonly string[]>;
  /** Opens for reading only. A failure becomes `{ kind: "read_failed", detail }`. */
  read(path: string): Promise<Result<Uint8Array, SentinelError>>;
  /** Writes UTF-8 text. Rejects on failure. */
  write(path: string, text: string): Promise<void>;
}>;

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

async function kind(path: string): Promise<PathKind> {
  try {
    const info = await promises.stat(path);
    if (info.isDirectory()) return "directory";
    return info.isFile() ? "file" : "other";
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return "missing";
    throw error;
  }
}

async function list(dir: string): Promise<readonly string[]> {
  const entries = await promises.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => !entry.isDirectory()).map((entry) => entry.name);
}

async function read(path: string): Promise<Result<Uint8Array, SentinelError>> {
  try {
    const bytes = await promises.readFile(path);
    return { ok: true, value: new Uint8Array(bytes) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { kind: "read_failed", detail } };
  }
}

async function write(path: string, text: string): Promise<void> {
  await promises.writeFile(path, text, "utf8");
}

export const nodeFiles: FilePort = { kind, list, read, write };
