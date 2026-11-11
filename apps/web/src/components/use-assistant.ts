"use client";

import { useEffect, useRef, useState } from "react";
import { buildInsertion, insertionLine, paragraphAt } from "../assistant-run";
import type { AssistantInfo } from "../client/api";
import { ASSISTANT_BUSY } from "../notices";
import type { AppServices } from "../services";
import type { Store } from "../store-runtime";

export const DRAFT_FAILED = "The assistant could not finish the draft. Nothing was inserted.";
export const DRAFT_EMPTY = "The assistant returned no text. Nothing was inserted.";

export type RunArgs = Readonly<{
  svc: AppServices;
  store: Store;
  info: AssistantInfo;
  prompt: string;
  getCaret: () => number;
  signal: AbortSignal;
  onText: (text: string) => void;
}>;

/** Where a run put its text: the line of the first inserted character, the run id, and whether Stop cut it short. */
export type Inserted = Readonly<{ line: number; runId: string; stopped: boolean }>;

export type DraftOutcome = Readonly<{
  message: string | null;
  inserted: Inserted | null;
  /** The reply text now in the Document, without the separating newlines. */
  insertedText: string;
}>;

const NOTHING: DraftOutcome = { message: null, inserted: null, insertedText: "" };

type InsertArgs = Readonly<{ a: RunArgs; reply: string; stopped: boolean }>;

/** One `AI` edit at the caret; `inserted` is set only when the Store accepted it. */
function insertReply({ a, reply, stopped }: InsertArgs): DraftOutcome {
  const now = a.store.getState();
  const insertion = buildInsertion({
    document: now.document,
    runLog: now.runLog,
    caret: a.getCaret(),
    text: reply,
    prompt: a.prompt,
    info: a.info,
    timestamp: a.svc.now().toISOString(),
  });
  const op = insertion.ops[0];
  if (op === undefined || op.kind !== "insert") return NOTHING;
  const line = insertionLine(now.document.text, op);
  // A rejected edit sets its own Notice in the Store.
  const result = a.store.dispatch({ type: "edit", ops: insertion.ops, run: insertion.run });
  if (result.error !== null) return NOTHING;
  const inserted = { line, runId: insertion.run.runId, stopped };
  return { message: null, inserted, insertedText: op.text.replace(/^\n|\n$/g, "") };
}

/**
 * One draft: stream into `onText` (never the Document), then on a clean end insert the whole
 * reply as one `AI` edit. Stop inserts the partial reply, if any. An epoch change (New or Load
 * while streaming) discards the reply.
 */
export async function runDraft(a: RunArgs): Promise<DraftOutcome> {
  const begin = a.store.getState();
  const context = paragraphAt(begin.document.text, a.getCaret());
  let reply = "";
  const done = await a.svc.api.draft(
    a.prompt,
    context,
    (chunk) => {
      if (a.signal.aborted) return;
      reply += chunk;
      a.onText(reply);
    },
    a.signal,
  );
  if (a.store.getState().epoch !== begin.epoch) return NOTHING;
  if (a.signal.aborted) {
    return reply.trim() === "" ? NOTHING : insertReply({ a, reply, stopped: true });
  }
  if (!done.ok) {
    const busy = done.error.kind === "status" && done.error.status === 429;
    return { ...NOTHING, message: busy ? ASSISTANT_BUSY : DRAFT_FAILED };
  }
  if (reply.trim() === "") return { ...NOTHING, message: DRAFT_EMPTY };
  return insertReply({ a, reply, stopped: false });
}

export type AssistantRun = Readonly<{
  text: string;
  streaming: boolean;
  /** True once a run has started, unless the first run was stopped with nothing inserted. */
  started: boolean;
  inserted: Inserted | null;
  message: string | null;
  start: (prompt: string) => void;
  stop: () => void;
}>;

type Deps = Readonly<{
  svc: AppServices;
  store: Store;
  info: AssistantInfo;
  getCaret: () => number;
}>;

type View = Readonly<{ text: string; inserted: Inserted | null; message: string | null }>;
const EMPTY_VIEW: View = { text: "", inserted: null, message: null };

export function useAssistantRun(deps: Deps): AssistantRun {
  const [view, setView] = useState<View>(EMPTY_VIEW);
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const shownBefore = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const start = (prompt: string): void => {
    const trimmed = prompt.trim();
    if (trimmed === "" || controller.current !== null) return;
    const ctl = new AbortController();
    controller.current = ctl;
    setView(EMPTY_VIEW);
    setStarted(true);
    setStreaming(true);
    const onText = (t: string): void => {
      setView({ ...EMPTY_VIEW, text: t });
    };
    void runDraft({ ...deps, prompt: trimmed, signal: ctl.signal, onText }).then((o) => {
      if (controller.current === ctl) controller.current = null;
      const firstEmptyStop = !shownBefore.current && ctl.signal.aborted && o.inserted === null;
      if (firstEmptyStop) setStarted(false);
      else shownBefore.current = true;
      setStreaming(false);
      setView({ text: o.insertedText, inserted: o.inserted, message: o.message });
      if (o.message !== null) deps.store.dispatch({ type: "notice", text: o.message });
    });
  };
  const stop = (): void => {
    controller.current?.abort();
  };
  return { ...view, streaming, started, start, stop };
}
