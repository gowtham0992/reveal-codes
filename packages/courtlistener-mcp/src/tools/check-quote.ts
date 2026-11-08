import { checkQuote, fetchOpinionText } from "@reveal-codes/verifier";
import type { ToolContext } from "../context";
import { errorResult, okResult } from "../results";
import type { ToolResult } from "../results";
import { checkQuoteShape, parseArgs } from "../schemas";

export async function handleCheckQuote(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = parseArgs(checkQuoteShape, args);
  if (!parsed.ok) return errorResult(parsed.error);
  const { clusterId, quote } = parsed.value;
  const text = await fetchOpinionText(String(clusterId), ctx.deps);
  if (text === null) {
    return okResult({
      status: "unchecked",
      reason: `Opinion text is unavailable for clusterId ${String(clusterId)}.`,
    });
  }
  return okResult(checkQuote(text, quote));
}
