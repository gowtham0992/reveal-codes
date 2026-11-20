/**
 * The Fault_Log (Req 7.4 to 7.6): one line `<ISO time> <event> <path or -> <reason>`.
 * No file text, no prompt text and no payload field can reach a line, because
 * the record has no field that could hold them. A failed write is discarded.
 */
import type { SkippedFile } from "../core/types.js";
import type { Deps, Fault, Logger } from "./deps.js";
import { atomicWrite } from "./atomic.js";

export const LOG_MAX_BYTES = 256 * 1024;
export const LOG_KEEP_BYTES = 128 * 1024;

/** Whitespace and control characters would break the one-line, four-field shape. */
function field(text: string): string {
  return text.replace(/[\s\p{Cc}]/gu, "_");
}

/** One log line, without its line feed. */
export function formatFaultLine(time: string, fault: Fault): string {
  const path = fault.path === null || fault.path === "" ? "-" : field(fault.path);
  return `${time} ${field(fault.event)} ${path} ${fault.reason}`;
}

/** The last `LOG_KEEP_BYTES` of `bytes`, starting at a line boundary. */
export function cutLog(bytes: Uint8Array): Uint8Array {
  const start = bytes.length - LOG_KEEP_BYTES;
  if (start <= 0) return bytes;
  const tail = bytes.subarray(start);
  if (bytes[start - 1] === 10) return tail;
  const newline = tail.indexOf(10);
  return newline < 0 ? new Uint8Array(0) : tail.subarray(newline + 1);
}

async function trimIfLarge(deps: Pick<Deps, "fs" | "pid">, logPath: string): Promise<void> {
  const stat = await deps.fs.lstat(logPath);
  if (!stat.ok || stat.value.size <= LOG_MAX_BYTES) return;
  const bytes = await deps.fs.readFile(logPath);
  if (!bytes.ok) return;
  await atomicWrite(deps, logPath, cutLog(bytes.value));
}

/** A logger that appends to `logPath` (errors.log); every failure is discarded. */
export function createFaultLog(deps: Pick<Deps, "fs" | "clock" | "pid">, logPath: string): Logger {
  return {
    fault: async (fault) => {
      await trimIfLarge(deps, logPath);
      await deps.fs.appendFile(logPath, `${formatFaultLine(deps.clock.nowIso(), fault)}\n`);
    },
  };
}

/**
 * Design M10: `over_limit` is logged once for each file until its size or
 * modification time changes. `skipped` is the `skipped` map of state.json.
 */
export function shouldLogOverLimit(
  skipped: Readonly<Record<string, SkippedFile>>,
  path: string,
  size: number,
  mtimeMs: number,
): boolean {
  const known = skipped[path];
  return known === undefined || known.size !== size || known.mtimeMs !== mtimeMs;
}
