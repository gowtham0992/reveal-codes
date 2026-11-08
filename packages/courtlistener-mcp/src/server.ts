import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context";
import { errorResult } from "./results";
import type { ToolResult } from "./results";
import { checkQuoteShape, getOpinionTextShape, lookupCitationsShape } from "./schemas";
import { handleCheckQuote } from "./tools/check-quote";
import { handleGetOpinionText } from "./tools/get-opinion-text";
import { handleLookupCitations } from "./tools/lookup-citations";
import { handleVerifierStatus } from "./tools/verifier-status";

/** Runs a handler; a rejection becomes a scrubbed tool error and a log line. */
function guarded(
  name: string,
  ctx: ToolContext,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  return run().then(
    (result) => {
      ctx.log(`tool ${name}${result.isError === true ? " failed" : " ok"}`);
      return result;
    },
    (cause: unknown) => {
      const message = ctx.scrub(cause instanceof Error ? cause.message : String(cause));
      ctx.log(`tool ${name} threw: ${message}`);
      return errorResult(`${name} failed: ${message}`);
    },
  );
}

/** Exactly four tools (Req 13.1). Handlers re-validate their arguments (Req 13.12). */
export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({ name: "courtlistener", version: "0.0.0" });
  server.registerTool(
    "lookup_citations",
    {
      description:
        "Extract citations from 1 to 50 strings and verify each against CourtListener. Returns text, offsets, source index and result.",
      inputSchema: lookupCitationsShape,
    },
    (args) => guarded("lookup_citations", ctx, () => handleLookupCitations(args, ctx)),
  );
  server.registerTool(
    "get_opinion_text",
    {
      description: "Fetch the plain text of the opinion for a CourtListener cluster id.",
      inputSchema: getOpinionTextShape,
    },
    (args) => guarded("get_opinion_text", ctx, () => handleGetOpinionText(args, ctx)),
  );
  server.registerTool(
    "check_quote",
    {
      description: "Check whether a quotation appears verbatim in the opinion of a cluster.",
      inputSchema: checkQuoteShape,
    },
    (args) => guarded("check_quote", ctx, () => handleCheckQuote(args, ctx)),
  );
  server.registerTool(
    "verifier_status",
    { description: "Rate-limit tokens available and cache counters." },
    () => guarded("verifier_status", ctx, () => Promise.resolve(handleVerifierStatus(ctx))),
  );
  return server;
}
