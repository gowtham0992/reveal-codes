import { apply, recordOverride, setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type {
  CallerOperation,
  Declaration,
  Document,
  EngineError,
  Inverse,
  Result,
} from "@reveal-codes/engine";
import { declarationAfter, insertedPasted } from "./declaration-clearing";
import { pushEdit, runRedo, runUndo } from "./history";
import { noticeForError, noticeForHistoryError } from "./notices";
import type { ActionResult, RunLogEntry, StoreAction, StoreState } from "./store";

function result(state: StoreState, parts: Partial<ActionResult> = {}): ActionResult {
  return { state, changed: false, error: null, skipped: 0, caret: null, ...parts };
}

function rejected(state: StoreState, error: EngineError, notice: string): ActionResult {
  return result({ ...state, notice }, { error });
}

/** History_Barrier: both stacks emptied (Requirement 8.10). */
function barrier(state: StoreState, document: Document): StoreState {
  return { ...state, document, undo: [], redo: [] };
}

type Applied = Readonly<{ document: Document; inverses: readonly Inverse[] }>;

function applyOps(
  start: Document,
  ops: readonly CallerOperation[],
): Applied | Readonly<{ error: EngineError }> {
  let doc = start;
  const inverses: Inverse[] = [];
  for (const op of ops) {
    const r = apply(doc, op);
    if (!r.ok) return { error: r.error };
    if (r.value.document === doc) continue;
    doc = r.value.document;
    inverses.push(r.value.inverse);
  }
  return { document: doc, inverses };
}

/** `edit`: all operations apply or none (Requirements 3.3, 3.4, 8.2 to 8.4). */
export function reduceEdit(
  state: StoreState,
  ops: readonly CallerOperation[],
  nowMs: number,
  run?: RunLogEntry,
): ActionResult {
  const applied = applyOps(state.document, ops);
  if ("error" in applied) return rejected(state, applied.error, noticeForError(applied.error));
  if (applied.inverses.length === 0) return result(state);
  const undo = pushEdit(state.undo, applied.inverses, ops, nowMs);
  const runLog = run === undefined ? state.runLog : withRun(state.runLog, run);
  const declaration = declarationAfter(
    state.declaration,
    applied.document,
    insertedPasted(ops),
  );
  const next = {
    ...state,
    document: applied.document,
    undo,
    redo: [],
    runLog,
    declaration,
    notice: null,
  };
  return result(next, { changed: true });
}

/** Appends `run`, replacing an entry with the same Run_Id (Requirement 23.6). */
function withRun(log: readonly RunLogEntry[], run: RunLogEntry): readonly RunLogEntry[] {
  const index = log.findIndex((entry) => entry.runId === run.runId);
  if (index === -1) return [...log, run];
  return log.map((entry, i) => (i === index ? run : entry));
}

/** `undo` and `redo` (Requirements 8.5 to 8.9). */
export function reduceHistory(state: StoreState, direction: "undo" | "redo"): ActionResult {
  const from = direction === "undo" ? state.undo : state.redo;
  const entry = from[from.length - 1];
  if (entry === undefined) return result(state);
  const run = direction === "undo" ? runUndo : runRedo;
  const stepped = run(state.document, entry);
  if (!stepped.ok) {
    return rejected(state, stepped.error, noticeForHistoryError(stepped.error, direction));
  }
  const produced = { group: stepped.value.produced, typing: null };
  const rest = from.slice(0, -1);
  const next: StoreState =
    direction === "undo"
      ? { ...state, undo: rest, redo: [...state.redo, produced] }
      : { ...state, redo: rest, undo: [...state.undo, produced] };
  return result(
    {
      ...next,
      document: stepped.value.document,
      declaration: declarationAfter(
        state.declaration,
        stepped.value.document,
        insertedPasted(entry.group),
      ),
      notice: null,
    },
    { changed: true, caret: stepped.value.caret },
  );
}

type PairsAction = Extract<StoreAction, { type: "verification" | "quoteCheck" }>;

/** `verification` and `quoteCheck`: skip failing pairs and count them (Requirements 3.6, 3.7). */
export function reducePairs(state: StoreState, action: PairsAction): ActionResult {
  const folded =
    action.type === "verification"
      ? foldPairs(state.document, action.pairs, setVerification)
      : foldPairs(state.document, action.pairs, setQuoteCheck);
  if (folded.applied === 0) return result(state, { skipped: folded.skipped });
  return result(barrier(state, folded.document), {
    changed: folded.document !== state.document,
    skipped: folded.skipped,
  });
}

function foldPairs<V>(
  start: Document,
  pairs: readonly (readonly [string, V])[],
  set: (doc: Document, key: string, value: V) => Result<Document, EngineError>,
): Readonly<{ document: Document; applied: number; skipped: number }> {
  let document = start;
  let applied = 0;
  let skipped = 0;
  for (const [key, value] of pairs) {
    const r = set(document, key, value);
    if (r.ok) {
      document = r.value;
      applied += 1;
    } else {
      skipped += 1;
    }
  }
  return { document, applied, skipped };
}

/** `override` (Requirements 3.8, 3.9). */
export function reduceOverride(
  state: StoreState,
  action: Extract<StoreAction, { type: "override" }>,
): ActionResult {
  const r = recordOverride(state.document, action.key, action.reason, action.timestamp);
  if (!r.ok) return rejected(state, r.error, noticeForError(r.error));
  return result(barrier(state, r.value), { changed: r.value !== state.document });
}

/** `replace` (Requirement 3.10). */
export function reduceReplace(
  state: StoreState,
  document: Document,
  runLog: readonly RunLogEntry[] | undefined,
  verifiedAt?: string | null,
  declaration?: Declaration | null,
): ActionResult {
  const next: StoreState = {
    ...barrier(state, document),
    runLog: runLog ?? [],
    verifiedAt: verifiedAt ?? null,
    declaration: declarationAfter(declaration ?? null, document, false),
    notice: null,
    epoch: state.epoch + 1,
  };
  return result(next, { changed: true });
}

/** `declaration`: stores the author's answer as given; no Document change. */
export function reduceDeclaration(
  state: StoreState,
  declaration: Declaration | null,
): ActionResult {
  return result({ ...state, declaration });
}

/** `verified`: records the Verify time; no Document change, so no history barrier. */
export function reduceVerified(state: StoreState, at: string): ActionResult {
  return result({ ...state, verifiedAt: at });
}
