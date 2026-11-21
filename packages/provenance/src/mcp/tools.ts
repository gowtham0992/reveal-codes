/**
 * The four read-only tools and `setup_provenance` (Req 12.2 to 12.8, 12.10, 12.11, 12.13): `reveal_file`,
 * `provenance_summary`, `untouched_agent_text` and `check_records`. Each calls the functions the
 * Reveal_Command calls (`io/load.ts`, `core/summary.ts`, `core/check.ts`), reads only the
 * Record_Directory, the ignore files and the files it describes, writes nothing and calls no
 * model. Errors are values: a failure is an error result, never an exception.
 */
import type { Document } from "@reveal-codes/engine";
import { checkWorkspace } from "../core/check.js";
import { hookWarning } from "../core/hook-warning.js";
import { summarize } from "../core/summary.js";
import type { Deps } from "../io/deps.js";
import { createFaultLog } from "../io/faults.js";
import {
  checkFactsOf,
  loadFile,
  loadHookEventAt,
  loadWorkspace,
  summaryInputOf,
} from "../io/load.js";
import type { WorkspaceFacts } from "../io/load.js";
import type { SetupReport } from "../io/setup.js";
import { formatSetupReport } from "../io/setup-cmd.js";
import { setupProvenance } from "../io/setup.js";
import { revealData, revealLines } from "./reveal-data.js";
import { errorResult, okResult } from "./results.js";
import type { ToolResult } from "./results.js";
import {
  checkData,
  checkLines,
  summaryData,
  summaryLines,
  untouchedData,
  untouchedLines,
} from "./summary-data.js";
import { resolveInside, resolveSetupRoot, resolveWorkspace } from "./workspace.js";
/**
 * What every tool needs: the file system and git, the current directory of the process, and the
 * path of the running Bundle, which `setup_provenance` copies (an `.mjs` file; anything else is
 * an error result, as for `provenance setup`).
 */
export type ToolContext = { deps: Deps; cwd: string; bundlePath: string };
type Workspace = { workspace?: string | undefined };
type RootRun = (root: string) => Promise<ToolResult>;
async function withRoot(ctx: ToolContext, args: Workspace, run: RootRun): Promise<ToolResult> {
  const root = await resolveWorkspace(ctx.deps, ctx.cwd, args.workspace);
  return root.ok ? run(root.value) : errorResult(root.error.message);
}
/** A `path` argument that names a file inside the root; an error result otherwise. */
function filePath(root: string, path: string): { path: string } | ToolResult {
  const inside = resolveInside(root, path);
  if (!inside.ok) return errorResult(inside.error.message);
  return inside.value === "" ? errorResult("The path must name a file.") : { path: inside.value };
}
function isFailure(value: { path: string } | ToolResult): value is ToolResult {
  return !("path" in value);
}
async function loadAll(ctx: ToolContext, root: string): Promise<WorkspaceFacts | ToolResult> {
  const loaded = await loadWorkspace(ctx.deps, root);
  return loaded.ok ? loaded.value : errorResult(`Records cannot be read: ${loaded.error.kind}`);
}
function isFacts(value: WorkspaceFacts | ToolResult): value is WorkspaceFacts {
  return "records" in value;
}
function recordDocs(facts: WorkspaceFacts): Map<string, Document> {
  const docs = new Map<string, Document>();
  for (const [path, record] of Object.entries(facts.records)) {
    if (record.ok) docs.set(path, record.doc);
  }
  return docs;
}
/** At most five text lines with `warning` first; the lines just before the last one give way. */
function warnedLines(warning: string | null, lines: readonly string[]): string[] {
  if (warning === null) return [...lines];
  const room = 4;
  const kept = lines.length <= room ? lines : [...lines.slice(0, room - 1), lines.at(-1) ?? ""];
  return [warning, ...kept];
}
/** An ok result whose `warning` field and first text line are the no-event line, if any (Req 12.15). */
function warnedResult(
  at: string | null,
  data: object,
  lines: readonly string[],
  extra: object = {},
  error = false,
): ToolResult {
  const warning = hookWarning(at);
  return okResult({ ...data, warning, ...extra }, warnedLines(warning, lines), error);
}
export async function revealFileTool(
  ctx: ToolContext,
  args: Workspace & { path: string },
): Promise<ToolResult> {
  return withRoot(ctx, args, async (root) => {
    const target = filePath(root, args.path);
    if (isFailure(target)) return target;
    const facts = await loadFile(ctx.deps, root, target.path);
    if (!facts.ok) return errorResult(`${target.path}: ${facts.error.kind}`);
    const data = revealData(facts.value, target.path);
    return warnedResult(await loadHookEventAt(ctx.deps, root), data, revealLines(data));
  });
}
export async function untouchedAgentTextTool(
  ctx: ToolContext,
  args: Workspace & { path: string; top?: number | undefined },
): Promise<ToolResult> {
  return withRoot(ctx, args, async (root) => {
    const target = filePath(root, args.path);
    if (isFailure(target)) return target;
    const facts = await loadAll(ctx, root);
    if (!isFacts(facts)) return facts;
    const { summary } = summarize(summaryInputOf(facts, target.path, args.top));
    const data = summary === null ? null : untouchedData(target.path, summary, recordDocs(facts));
    if (summary === null || data === null) {
      return errorResult(`Nothing is recorded for ${target.path}.`);
    }
    const at = await loadHookEventAt(ctx.deps, root);
    return warnedResult(at, data, untouchedLines(data, summary));
  });
}
export async function provenanceSummaryTool(
  ctx: ToolContext,
  args: Workspace & { path?: string | undefined; top?: number | undefined },
): Promise<ToolResult> {
  return withRoot(ctx, args, async (root) => {
    const inside = resolveInside(root, args.path ?? "");
    if (!inside.ok) return errorResult(inside.error.message);
    const facts = await loadAll(ctx, root);
    if (!isFacts(facts)) return facts;
    const scope = inside.value === "" ? null : inside.value;
    const result = summarize(summaryInputOf(facts, scope, args.top));
    if (result.summary === null) return errorResult(result.lines[0] ?? "Nothing is recorded.");
    const data = summaryData(result.summary, recordDocs(facts), facts.sessions);
    const at = await loadHookEventAt(ctx.deps, root);
    return warnedResult(at, data, summaryLines(result.summary));
  });
}
export async function checkRecordsTool(
  ctx: ToolContext,
  args: Workspace & { strict?: boolean | undefined },
): Promise<ToolResult> {
  return withRoot(ctx, args, async (root) => {
    const facts = await loadAll(ctx, root);
    if (!isFacts(facts)) return facts;
    const result = checkWorkspace(checkFactsOf(facts, args.strict === true));
    const data = checkData(result, facts.files.length);
    const at = await loadHookEventAt(ctx.deps, root);
    const hookEvents = { any: at !== null, lastHookEventAt: at };
    return warnedResult(at, data, checkLines(result), { hookEvents }, result.status !== 0);
  });
}
/** The text lines of a setup result: the lines `provenance setup` prints, under one heading line. */
function setupLines(root: string, report: SetupReport): string[] {
  return [`Provenance is set up in ${root}.`, ...formatSetupReport(report)];
}
/**
 * `setup_provenance` (Req 12.9, 12.12, 12.14, 13.3, 13.4): the installation of `provenance setup`
 * for `workspace`, or for the current directory only when it holds `.git` or `.kiro`. The only
 * tool that writes. `gitHook` also writes the pre-commit block (Req 13.14); it is off by default.
 */
export async function setupProvenanceTool(
  ctx: ToolContext,
  args: Workspace & { gitHook?: boolean | undefined },
): Promise<ToolResult> {
  const root = await resolveSetupRoot(ctx.deps, ctx.cwd, args.workspace);
  if (!root.ok) return errorResult(root.error.message);
  const log = createFaultLog(ctx.deps, `${root.value}/.kiro/provenance/errors.log`);
  const deps = { ...ctx.deps, log };
  const done = await setupProvenance(deps, root.value, ctx.bundlePath, args.gitHook === true);
  if (!done.ok) {
    const detail = done.error.detail === undefined ? "" : `: ${done.error.detail}`;
    return errorResult(`Setup failed (${done.error.kind}${detail}).`);
  }
  const { written, replaced, kept } = done.value;
  const lines = setupLines(root.value, done.value);
  return okResult({ written, replaced, kept }, lines, false, lines.length);
}
