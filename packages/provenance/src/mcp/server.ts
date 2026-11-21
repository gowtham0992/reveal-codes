/**
 * The stdio MCP server of `provenance mcp` (Req 12.1, 12.2, 12.14). Loaded by a dynamic
 * `import()` from `cli/main.ts` only for that command, so the hook path never evaluates the SDK.
 * Standard output carries protocol messages only.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Deps } from "../io/deps.js";
import {
  checkRecordsInput,
  checkRecordsOutput,
  provenanceSummaryInput,
  provenanceSummaryOutput,
  revealFileInput,
  revealFileOutput,
  setupProvenanceInput,
  setupProvenanceOutput,
  untouchedAgentTextInput,
  untouchedAgentTextOutput,
} from "./schemas.js";
import {
  checkRecordsTool,
  provenanceSummaryTool,
  revealFileTool,
  setupProvenanceTool,
  untouchedAgentTextTool,
} from "./tools.js";
import type { ToolContext } from "./tools.js";
import { serverVersion } from "./version.js";
const READ_ONLY = { readOnlyHint: true };
function registerFileTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "reveal_file",
    {
      description:
        "Call this to see which agent run or person wrote each span of one file, as line and column ranges, from the record and not from memory.",
      inputSchema: revealFileInput,
      outputSchema: revealFileOutput,
      annotations: READ_ONLY,
    },
    (args) => revealFileTool(ctx, args),
  );
  server.registerTool(
    "untouched_agent_text",
    {
      description:
        "Call this when asked which parts of a file the agent wrote and nobody has changed since.",
      inputSchema: untouchedAgentTextInput,
      outputSchema: untouchedAgentTextOutput,
      annotations: READ_ONLY,
    },
    (args) => untouchedAgentTextTool(ctx, args),
  );
}
function registerWorkspaceTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "provenance_summary",
    {
      description:
        "Call this for the share of agent, edited and human text across the workspace or under a path, the agent windows that wrote it and the longest untouched stretches.",
      inputSchema: provenanceSummaryInput,
      outputSchema: provenanceSummaryOutput,
      annotations: READ_ONLY,
    },
    (args) => provenanceSummaryTool(ctx, args),
  );
  server.registerTool(
    "check_records",
    {
      description:
        "Call this to find out whether the Records are intact and current, before relying on them or when a result looks wrong.",
      inputSchema: checkRecordsInput,
      outputSchema: checkRecordsOutput,
      annotations: READ_ONLY,
    },
    (args) => checkRecordsTool(ctx, args),
  );
}
/** `setup_provenance` is the only tool that writes, so it carries no `readOnlyHint` (Req 12.14). */
function registerSetupTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "setup_provenance",
    {
      description:
        "Call this, after the person agrees, to install provenance recording in a workspace; it writes files and returns which were written, replaced and kept.",
      inputSchema: setupProvenanceInput,
      outputSchema: setupProvenanceOutput,
    },
    (args) => setupProvenanceTool(ctx, args),
  );
}
/** The server with the four read tools and `setup_provenance`. */
export function createProvenanceServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "provenance", version: serverVersion() });
  registerFileTools(server, ctx);
  registerWorkspaceTools(server, ctx);
  registerSetupTool(server, ctx);
  return server;
}
/** Serves the tools over standard input and output until the client closes the stream. */
export async function runMcpServer(deps: Deps, cwd: string, bundlePath: string): Promise<void> {
  const server = createProvenanceServer({ deps, cwd: cwd.replace(/\\/gu, "/"), bundlePath });
  await server.connect(new StdioServerTransport());
}
