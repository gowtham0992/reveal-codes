import { fetchOpinionText } from "@reveal-codes/verifier";
import type { ToolContext } from "../context";
import { errorResult, okResult } from "../results";
import type { ToolResult } from "../results";
import { getOpinionTextShape, parseArgs } from "../schemas";

export async function handleGetOpinionText(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = parseArgs(getOpinionTextShape, args);
  if (!parsed.ok) return errorResult(parsed.error);
  const { clusterId } = parsed.value;
  const text = await fetchOpinionText(String(clusterId), ctx.deps);
  if (text === null) {
    return okResult({
      clusterId,
      text: null,
      message: `Opinion text is unavailable for clusterId ${String(clusterId)}.`,
    });
  }
  return okResult({ clusterId, text });
}
