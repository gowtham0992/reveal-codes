import type { Document, IssueKey } from "@reveal-codes/engine";
import { docxSafe } from "@reveal-codes/export";
import type { DisplayInfo } from "@reveal-codes/verifier/link";
import type { ApiClient } from "../client/api";
import { pastedDocument } from "../client/pasted-document";
import { hasFullRecord, runVerifyFlow } from "../client/verify-flow";
import type { VerifyOutcome } from "../client/verify-flow";
import { FAILED_NOTICE } from "../client/verify-summary";
import { MAX_TEXT_CHARS } from "../limits";
import { DOCUMENT_TOO_LONG } from "../notices";
import { createStore } from "../store-runtime";

export const BLANK_TEXT_SENTENCE = "Add some text to check.";
export const NO_CITATIONS_SENTENCE = "No citations were found in this draft.";

export type CheckDone = Readonly<{
  kind: "done";
  document: Document;
  info: ReadonlyMap<IssueKey, DisplayInfo>;
  outcome: VerifyOutcome;
  /** ISO timestamp of the run, from `now`. */
  checkedAt: string;
  /** The Draft_Text that was checked, as given. */
  text: string;
}>;

export type CheckResult =
  CheckDone | Readonly<{ kind: "message"; text: string }> | Readonly<{ kind: "discarded" }>;

function message(text: string): CheckResult {
  return { kind: "message", text };
}

/** Never rejects: refusals and failures come back as a `message` result. */
export async function runCheck(
  args: Readonly<{ text: string; api: ApiClient; now: () => Date }>,
): Promise<CheckResult> {
  const { text, api, now } = args;
  const safe = docxSafe(text).text;
  if (safe.length > MAX_TEXT_CHARS) return message(DOCUMENT_TOO_LONG);
  if (/^\s*$/.test(safe)) return message(BLANK_TEXT_SENTENCE);
  const checkedAt = now().toISOString();
  const built = pastedDocument(safe, checkedAt);
  if (typeof built === "string") return message(built);
  if (!hasFullRecord(built)) return message(NO_CITATIONS_SENTENCE);
  const store = createStore(now);
  store.dispatch({ type: "replace", document: built });
  const outcome = await runVerifyFlow(api, store, now);
  if (outcome.status === "failed") return message(outcome.failure ?? FAILED_NOTICE);
  if (outcome.status === "discarded") return { kind: "discarded" };
  return {
    kind: "done",
    document: store.getState().document,
    info: new Map(outcome.info ?? []),
    outcome,
    checkedAt,
    text,
  };
}
