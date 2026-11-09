// Public surface of the Sentinel. The process entry (cli.ts) is not exported.
export { analyseFile } from "./analyse.js";
export { parseArgs, USAGE } from "./args.js";
export type { Command, UsageError } from "./args.js";
export { buildDeps, readSentinelConfig, DEFAULT_BASE_URL } from "./deps.js";
export type { SentinelConfig, SentinelEnv, SentinelIo } from "./deps.js";
export { readDocx } from "./docx-read.js";
export { nodeFiles } from "./files.js";
export type { FilePort, PathKind } from "./files.js";
export { deriveFindings, unreadable } from "./findings.js";
export { recordedDocument } from "./recorded.js";
export { redact } from "./redact.js";
export { renderJson, renderReport } from "./report.js";
export { reverify } from "./reverify.js";
export type { ReverifyOutcome } from "./reverify.js";
export { run } from "./run.js";
export type { RunIo } from "./run.js";
export { realSleep } from "./sleep.js";
export { splitExport } from "./split.js";
export { analyseAll, selectFiles } from "./sweep.js";
export type { Target } from "./sweep.js";
export type {
  Clock,
  DocxText,
  ExportParts,
  FileReport,
  Finding,
  Mode,
  SentinelError,
  SweepReport,
} from "./types.js";
