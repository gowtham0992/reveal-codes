/**
 * The four read-only tools (Req 12.2 to 12.8, 12.10, 12.11, 12.13): `reveal_file`,
 * `provenance_summary`, `untouched_agent_text` and `check_records`. Each calls the functions the
 * Reveal_Command calls (`io/load.ts`, `core/summary.ts`, `core/check.ts`), reads only the
 * Record_Directory, the ignore files and the files it describes, writes nothing and calls no
 * model. Errors are values: a failure is an error result, never an exception.
 */
import type { Document } from "@reveal-codes/engine";
import { checkWorkspace } from "../core/check.js";
import { summarize } from "../core/summary.js";
import type { Deps } from "../io/deps.js";
import { checkFactsOf, loadFile, loadWorkspace, summaryInputOf } from "../io/load.js";
import type { WorkspaceFacts } from "../io/load.js";
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
import { resolveInside, resolveWorkspace } from "./workspace.js";
/** What every tool needs: the file system and git, and the current directory of the process. */
export type ToolContext = { deps: Deps; cwd: string };
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
    return okResult(data, revealLines(data));
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
    return okResult(data, untouchedLines(data, summary));
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
    return okResult(data, summaryLines(result.summary));
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
    return okResult(data, checkLines(result), result.status !== 0);
  });
}
