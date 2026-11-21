/**
 * The `outputSchema` of the five Provenance_Tools (Req 12.3 to 12.9, design "The MCP tools",
 * Types). With `workspace.ts` this is where `zod` is imported; nothing outside `src/mcp/` may.
 */
import { z } from "zod";

const count = z.number().int().nonnegative();
const origin = z.enum(["AI", "AI>HUM", "HUM", "PST"]);

/** `StructuredSpan`: 1-based lines and columns in UTF-16 code units, end exclusive. */
export const structuredSpanSchema = z.object({
  startLine: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  endColumn: z.number().int().min(1),
  length: count,
  origin,
  run: z.string().nullable(),
  taskNumber: z.string().nullable(),
  taskTitle: z.string().nullable(),
});

const fileSpanSchema = structuredSpanSchema.extend({ file: z.string() });

/** Characters or shares (percentages) by origin. */
const byOrigin = z.object({
  AI: z.number().nonnegative(),
  "AI>HUM": z.number().nonnegative(),
  HUM: z.number().nonnegative(),
  PST: z.number().nonnegative(),
});

const characters = z.object({ AI: count, "AI>HUM": count, HUM: count, PST: count });

/** `FileCounts = { path, stale, characters, shares }`. */
export const fileCountsSchema = z.object({
  path: z.string(),
  stale: z.boolean(),
  characters,
  shares: byOrigin,
});

/** `WindowRow = { windowRun, taskNumber, taskTitle, openedAt, files, runs, aiCharacters, aiHumCharacters }`. */
export const windowRowSchema = z.object({
  windowRun: z.string(),
  taskNumber: z.string().nullable(),
  taskTitle: z.string(),
  openedAt: z.string().nullable(),
  files: count,
  runs: count,
  aiCharacters: count,
  aiHumCharacters: count,
});

/** The reasons of Requirement 9, criterion 9, and `tampered_record`, which `reveal <file>` also prints. */
export const revealReasons = [
  "not_tracked",
  "over_limit",
  "binary",
  "ignored",
  "no_record",
  "tampered_record",
] as const;

const revealFileData = z.object({
  file: z.string(),
  status: z.enum(["current", "unchanged_baseline", "stale", "unrecorded"]),
  reason: z.enum(revealReasons).nullable(),
  unrecordedCharacters: count,
  spans: z.array(structuredSpanSchema),
  legend: z.array(z.string()).length(4),
});

const untouchedAgentTextData = z.object({
  path: z.string(),
  stretches: z.array(structuredSpanSchema),
  countsByOrigin: characters,
  omittedAiHumCharacters: count,
  stale: z.boolean(),
  notice: z.string(),
});

const provenanceSummaryData = z.object({
  files: z.array(fileCountsSchema),
  total: fileCountsSchema,
  windows: z.array(windowRowSchema),
  stretches: z.array(fileSpanSchema),
  omittedAiHumCharacters: count,
  noPromptEventSessions: count,
  notice: z.string(),
});

const checkLine = z.object({
  path: z.string(),
  reason: z.enum(["tampered_record", "orphan_record", "orphan_baseline", "stale", "no_record"]),
});

const checkRecordsData = z.object({
  ok: z.boolean(),
  filesChecked: count,
  failures: z.array(checkLine),
  reports: z.array(checkLine),
});

/** The no-event line of Requirement 9, criterion 19, or null (Req 12.15). */
const warning = z.object({ warning: z.string().nullable() });
export const revealFileOutput = revealFileData.merge(warning);
export const untouchedAgentTextOutput = untouchedAgentTextData.merge(warning);
export const provenanceSummaryOutput = provenanceSummaryData.merge(warning);
/** `hookEvents`: `any` is true exactly when `lastHookEventAt` is a string (Req 12.15). */
export const checkRecordsOutput = checkRecordsData.merge(warning).extend({
  hookEvents: z.object({ any: z.boolean(), lastHookEventAt: z.string().nullable() }),
});
export const setupProvenanceOutput = z.object({
  written: z.array(z.string()),
  replaced: z.array(z.string()),
  kept: z.array(z.string()),
});

export type StructuredSpanJson = z.infer<typeof structuredSpanSchema>;
export type RevealFileJson = z.infer<typeof revealFileData>;
export type UntouchedAgentTextJson = z.infer<typeof untouchedAgentTextData>;
export type ProvenanceSummaryJson = z.infer<typeof provenanceSummaryData>;
export type CheckRecordsJson = z.infer<typeof checkRecordsData>;
export type SetupProvenanceJson = z.infer<typeof setupProvenanceOutput>;
const workspaceArg = z.string().optional();
const topArg = z.number().int().min(1).optional();
/** The input shapes of the four read tools (Req 12.4 to 12.7, 12.12). */
export const revealFileInput = { path: z.string().min(1), workspace: workspaceArg };
export const untouchedAgentTextInput = {
  path: z.string().min(1),
  top: topArg,
  workspace: workspaceArg,
};
export const provenanceSummaryInput = {
  path: z.string().optional(),
  top: topArg,
  workspace: workspaceArg,
};
export const checkRecordsInput = { strict: z.boolean().optional(), workspace: workspaceArg };
/** `setup_provenance`: `gitHook` also writes the pre-commit block; the Setup_Skill only offers it (Req 13.7). */
export const setupProvenanceInput = {
  workspace: workspaceArg,
  gitHook: z.boolean().default(false),
};
