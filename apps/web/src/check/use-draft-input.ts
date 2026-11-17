"use client";
import { docxSafe } from "@reveal-codes/export";
import { createElement, useState } from "react";
import type { Dispatch, ReactElement } from "react";
import { openFile } from "../client/open-file";
import type { OpenInput } from "../client/open-file";
import { checkOpenedMessage } from "../client/open-messages";
import type { OpenOutcome } from "../client/open-outcome";
import { ConfirmDialog } from "../components/confirm-dialog";
import { AVIANCA_FAILED, DOCUMENT_CONFIRM_COPY } from "../components/use-document-actions";
import { useOpen } from "../components/use-open";
import type { AppServices } from "../services";
import type { CheckAction, CheckState } from "./check-state";

type Accepted = Exclude<OpenOutcome, { kind: "refused" }>;
type Pending =
  | Readonly<{ kind: "file"; name: string; outcome: Accepted }>
  | Readonly<{ kind: "sample"; text: string }>;

function acceptedText(outcome: Accepted): string {
  return outcome.kind === "restored" ? outcome.document.text : outcome.text;
}

function openedSentence(name: string, outcome: Accepted): string {
  if (outcome.kind === "restored") {
    return checkOpenedMessage(name, outcome.document.text.length, 0, false, true);
  }
  return checkOpenedMessage(name, outcome.text.length, outcome.removed, outcome.hasNotes, false);
}

type Input = Readonly<{
  state: CheckState;
  dispatch: Dispatch<CheckAction>;
  svc: AppServices;
  setMessage: (text: string | null) => void;
  askReplace: (value: Pending) => void;
}>;

function installFile(input: Input, name: string, outcome: Accepted): void {
  input.setMessage(null);
  input.dispatch({ type: "edit", text: acceptedText(outcome) });
  input.dispatch({ type: "note", text: openedSentence(name, outcome) });
}

async function runOpen(input: Input, file: OpenInput): Promise<void> {
  input.dispatch({ type: "note", text: null });
  input.setMessage(null);
  const outcome = await openFile(file);
  if (outcome.kind === "refused") {
    input.setMessage(outcome.notice);
    input.dispatch({ type: "note", text: outcome.note });
  } else if (input.state.text.length === 0) installFile(input, file.name, outcome);
  else input.askReplace({ kind: "file", name: file.name, outcome });
}

async function runSample(input: Input): Promise<void> {
  input.dispatch({ type: "note", text: null });
  input.setMessage(null);
  const fetched = await input.svc.api.aviancaCitations();
  if (!fetched.ok) {
    input.setMessage(AVIANCA_FAILED);
    return;
  }
  const text = docxSafe(fetched.value).text;
  if (input.state.text.length === 0) input.dispatch({ type: "edit", text });
  else input.askReplace({ kind: "sample", text });
}

function dialogProps(pending: Pending, restoreFocus: HTMLElement | null) {
  if (pending.kind === "file") {
    return {
      title: "Open a draft",
      message: `Discard the current draft and open ${pending.name}?`,
      confirmLabel: "Discard and open",
      restoreFocus,
    };
  }
  return { ...DOCUMENT_CONFIRM_COPY.avianca, restoreFocus };
}

/** The replace confirm and the element that regains focus when it closes. */
function useReplaceAsk() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const remember = (): void => {
    const active = document.activeElement;
    setOpener(active instanceof HTMLElement ? active : null);
  };
  const close = (): void => {
    setPending(null);
  };
  const render = (onYes: (value: Pending) => void): ReactElement | null =>
    pending === null
      ? null
      : createElement(ConfirmDialog, {
          ...dialogProps(pending, opener),
          onConfirm: () => {
            close();
            onYes(pending);
          },
          onCancel: close,
        });
  return { ask: setPending, remember, render };
}

/**
 * Open a file, Load the Avianca citations and Clear for the check page. Typing, pasting, Open and
 * Clear make no request; only the sample calls `api.aviancaCitations()`.
 */
export function useDraftInput(
  state: CheckState,
  dispatch: Dispatch<CheckAction>,
  svc: AppServices,
) {
  const [inputMessage, setInputMessage] = useState<string | null>(null);
  const replace = useReplaceAsk();
  const input: Input = {
    state,
    dispatch,
    svc,
    setMessage: setInputMessage,
    askReplace: replace.ask,
  };
  const picker = useOpen((file) => {
    replace.remember();
    void runOpen(input, file);
  });
  const dialog = replace.render((value) => {
    if (value.kind === "file") installFile(input, value.name, value.outcome);
    else dispatch({ type: "edit", text: value.text });
  });
  return {
    openInput: { ref: picker.inputRef, accept: picker.accept, onChange: picker.onChange },
    onOpen: picker.openPicker,
    onSample: () => {
      replace.remember();
      void runSample(input);
    },
    onClear: () => {
      setInputMessage(null);
      dispatch({ type: "clear" });
    },
    /** Refusal or failure sentence of Open and the sample; the page shows it beside `state.message`. */
    inputMessage,
    dialog,
  };
}
