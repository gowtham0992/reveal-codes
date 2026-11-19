// The pure API is exported here as the modules of src/core/ are built.
export type {
  Baseline,
  FileCache,
  FileFact,
  Hunk,
  HookEvent,
  OpenWindow,
  Origin,
  Payload,
  ProvenanceError,
  SessionState,
  WindowState,
} from "./core/types.js";
export * from "./core/limits.js";
export { parsePayload } from "./core/payload.js";
export type { IgnoreRule, IgnoreRules } from "./core/ignore-parse.js";
export { parseIgnore } from "./core/ignore-parse.js";
export { isIgnored, isIgnoredByAny } from "./core/ignore.js";
export type { Label, LabelKind, RunName } from "./core/label.js";
export {
  describeRun,
  makeLabel,
  parseRunId,
  parseTaskName,
  runId,
  windowRunName,
} from "./core/label.js";
export type { ChangeOrigin, Clock, WindowRef } from "./core/plan.js";
export { existingRunNumbers, planHunks } from "./core/plan.js";
export { decodeSessions, decodeState, encodeSessions, encodeState } from "./core/state-codec.js";
export { appearedRecord, firstRecord, updateRecord } from "./core/update.js";
