import { createDocument } from "@reveal-codes/engine";
import type {
  CallerOperation,
  Declaration,
  Document,
  EngineError,
  IssueKey,
  QuoteCheckResult,
  VerificationResult,
} from "@reveal-codes/engine";
import type { UndoEntry } from "./history";
import {
  reduceDeclaration,
  reduceEdit,
  reduceHistory,
  reduceOverride,
  reduceReplace,
  reduceVerified,
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
  /** ISO instant of the last completed Verify, or null. */
  verifiedAt: string | null;
  /** The stored Declaration about pasted text; apply it with applicableDeclaration at use sites. */
  declaration: Declaration | null;
  notice: string | null;
  /** The Open_Note shown in the Issues region; memory only, never persisted. */
  openNote: string | null;
  epoch: number;
}>;

export type StoreAction =
  | Readonly<{ type: "edit"; ops: readonly CallerOperation[]; run?: RunLogEntry }>
  | Readonly<{ type: "undo" }>
  | Readonly<{ type: "redo" }>
  | Readonly<{
      type: "verification";
      pairs: readonly (readonly [IssueKey, VerificationResult])[];
    }>
  | Readonly<{ type: "quoteCheck"; pairs: readonly (readonly [IssueKey, QuoteCheckResult])[] }>
  | Readonly<{ type: "override"; key: IssueKey; reason: string; timestamp: string }>
  | Readonly<{
      type: "replace";
      document: Document;
      runLog?: readonly RunLogEntry[];
      verifiedAt?: string | null;
      declaration?: Declaration | null;
    }>
  | Readonly<{ type: "declaration"; declaration: Declaration | null }>
  | Readonly<{ type: "verified"; at: string }>
  | Readonly<{ type: "notice"; text: string | null }>
  | Readonly<{ type: "openNote"; text: string | null }>;

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
  return {
    document: created.value,
    undo: [],
    redo: [],
    runLog: [],
    verifiedAt: null,
    declaration: null,
    notice: null,
    openNote: null,
    epoch: 0,
  };
}

function unchanged(state: StoreState): ActionResult {
  return { state, changed: false, error: null, skipped: 0, caret: null };
}

/** Pure reducer. The clock is read only for coalescing (edit) and never mutates `state`. */
export function reduce(state: StoreState, action: StoreAction, now: () => Date): ActionResult {
  switch (action.type) {
    case "edit":
      return reduceEdit(state, action.ops, now().getTime(), action.run);
    case "undo":
    case "redo":
      return reduceHistory(state, action.type);
    case "verification":
    case "quoteCheck":
      return reducePairs(state, action);
    case "override":
      return reduceOverride(state, action);
    case "replace":
      return reduceReplace(
        state,
        action.document,
        action.runLog,
        action.verifiedAt,
        action.declaration,
      );
    case "declaration":
      return reduceDeclaration(state, action.declaration);
    case "verified":
      return reduceVerified(state, action.at);
    case "notice":
      return unchanged({ ...state, notice: action.text });
    case "openNote":
      return unchanged({ ...state, openNote: action.text });
  }
}
