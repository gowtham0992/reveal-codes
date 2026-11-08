"use client";

import { useEffect, useRef, useState } from "react";
import { buildInsertion, paragraphAt } from "../assistant-run";
import type { AssistantInfo } from "../client/api";
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

/**
 * One draft: stream into `onText` (never the Document), then on a clean end insert the whole
 * reply as one `AI` edit. Returns a message for a failure, else null. Stop and an epoch change
 * (New or Load while streaming) discard the reply.
 */
export async function runDraft(a: RunArgs): Promise<string | null> {
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
  const now = a.store.getState();
  if (a.signal.aborted || now.epoch !== begin.epoch) return null;
  if (!done.ok) return DRAFT_FAILED;
  if (reply.trim() === "") return DRAFT_EMPTY;
  const insertion = buildInsertion({
    document: now.document,
    runLog: now.runLog,
    caret: a.getCaret(),
    text: reply,
    prompt: a.prompt,
    info: a.info,
    timestamp: a.svc.now().toISOString(),
  });
  // A rejected edit sets its own Notice in the Store.
  a.store.dispatch({ type: "edit", ops: insertion.ops, run: insertion.run });
  return null;
}

export type AssistantRun = Readonly<{
  text: string;
  streaming: boolean;
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

export function useAssistantRun(deps: Deps): AssistantRun {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
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
    setText("");
    setMessage(null);
    setStreaming(true);
    void runDraft({ ...deps, prompt: trimmed, signal: ctl.signal, onText: setText }).then((m) => {
      if (controller.current === ctl) controller.current = null;
      setStreaming(false);
      setText("");
      setMessage(m);
      if (m !== null) deps.store.dispatch({ type: "notice", text: m });
    });
  };
  const stop = (): void => {
    controller.current?.abort();
  };
  return { text, streaming, message, start, stop };
}
