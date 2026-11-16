import { verifierStatus } from "@reveal-codes/verifier";
import type { Mode, ToolContext } from "../context";
import { okResult } from "../results";
import type { ToolResult } from "../results";
const MESSAGES: Readonly<Record<Mode, string>> = {
  fixtures:
    "Fixtures mode: answers come from recorded CourtListener responses, not from a live lookup. Only the demo motion and the Mata v. Avianca citations are recorded, so a citation reported as not found here may still exist. Set COURTLISTENER_TOKEN to check live.",
  live: "Live mode: citations are checked against CourtListener with your token.",
  live_without_token:
    "Live mode, but COURTLISTENER_TOKEN is not set. CourtListener refuses citation lookups without a token, so no citation can be checked.",
};
export function handleVerifierStatus(ctx: ToolContext): ToolResult {
  return okResult({ ...verifierStatus(ctx.deps), mode: ctx.mode, message: MESSAGES[ctx.mode] });
}
