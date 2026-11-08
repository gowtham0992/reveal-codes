import { createDocument } from "@reveal-codes/engine";
import type {
  CallerOperation,
  Document,
  EngineError,
  IssueKey,
  QuoteCheckResult,
  VerificationResult,
} from "@reveal-codes/engine";
import type { UndoEntry } from "./history";
import {
  reduceEdit,
  reduceHistory,
  reduceOverride,
  reduceReplace,
  reducePairs,
} from "./store-actions";

export type { TypingMark, UndoEntry } from "./history";

/** One assistant run; kept beside the Document because the Engine RunEntry has no such fields (L2). */
export type RunLogEntry = Readonly<{
  runId: string;
  provider: string;
  modelId: string | null;
  prompt: string;
  timestamp: string;
}>;

export type StoreState = Readonly<{
  document: Document;
  /** Last element is the top. */
  undo: readonly UndoEntry[];
  redo: readonly UndoEntry[];
  runLog: readonly RunLogEntry[];
  notice: string | null;
  epoch: number;
}>;

export type StoreAction =
  | Readonly<{ type: "edit"; ops: readonly CallerOperation[] }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{
      type: "verification";
      pairs: readonly (readonly [IssueKey, VerificationResult])[];
    }>
  | Readonly<{ type: "quoteCheck"; pairs: readonly (readonly [IssueKey, QuoteCheckResult])[] }>
  | Readonly<{ type: "override"; key: IssueKey; reason: string; timestamp: string }>
  | Readonly<{ type: "replace"; document: Document; runLog?: readonly RunLogEntry[] }>
  | Readonly<{ type: "notice"; text: string | null }>;

export type ActionResult = Readonly<{
  state: StoreState;
  /** The Document changed. */
  changed: boolean;
  /** First Engine error that rejected the action, else null. */
  error: EngineError | null;
  /** Pairs skipped by verification or quoteCheck (Requirements 3.6, 3.7). */
  skipped: number;
  /** Offset for the caret after undo or redo (Requirement 8.9), else null. */
  caret: number | null;
}>;

/** The initial state; throws only if the Engine rejects its own valid timestamp. */
export function initialState(now: () => Date): StoreState {
  const created = createDocument("", now().toISOString());
  if (!created.ok) throw new Error(`initial document rejected: ${created.error.kind}`);
  return { document: created.value, undo: [], redo: [], runLog: [], notice: null, epoch: 0 };
}

/** Pure reducer. The clock is read only for coalescing (edit) and never mutates `state`. */
export function reduce(state: StoreState, action: StoreAction, now: () => Date): ActionResult {
  switch (action.type) {
    case "edit":
      return reduceEdit(state, action.ops, now().getTime());
    case "undo":
    case "redo":
      return reduceHistory(state, action.type);
    case "verification":
    case "quoteCheck":
      return reducePairs(state, action);
    case "override":
      return reduceOverride(state, action);
    case "replace":
      return reduceReplace(state, action.document, action.runLog);
    case "notice":
      return {
        state: { ...state, notice: action.text },
        changed: false,
        error: null,
        skipped: 0,
        caret: null,
      };
  }
}
