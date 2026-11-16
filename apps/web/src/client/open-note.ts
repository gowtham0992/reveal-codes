import type { Document } from "@reveal-codes/engine";
import { hasVerificationResult } from "./check-date";

const RUN_VERIFY = " Run Verify to check the citations again and record the date.";

const BOTH =
  "The tool names of the assistant runs and the check date were not in this file, so the next statement cannot give them." +
  RUN_VERIFY;
const RUNS_ONLY =
  "The tool names of the assistant runs were not in this file, so the next statement cannot name them.";
const RESULTS_ONLY =
  "The check date was not in this file, so the next statement cannot give it." + RUN_VERIFY;

/** The Issues note after a restore (Requirement 13 criteria 2 to 5), or null when nothing needs saying. */
export function restoreNote(document: Document): string | null {
  const hasAiRun = document.runs.length > 0;
  const hasResult = hasVerificationResult(document);
  if (hasAiRun && hasResult) return BOTH;
  if (hasAiRun) return RUNS_ONLY;
  return hasResult ? RESULTS_ONLY : null;
}
