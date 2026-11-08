import { verifierStatus } from "@reveal-codes/verifier";
import type { ToolContext } from "../context";
import { okResult } from "../results";
import type { ToolResult } from "../results";

export function handleVerifierStatus(ctx: ToolContext): ToolResult {
  return okResult(verifierStatus(ctx.deps));
}
