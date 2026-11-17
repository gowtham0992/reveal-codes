"use client";
import { docxSafe } from "@reveal-codes/export";
import { useReducer, useState } from "react";
import type { MouseEvent } from "react";
import { DEMO_MODE_LINE } from "../components/issues-region";
import { Mark } from "../components/mark";
import { useModeResult } from "../components/use-server-mode";
import { WAITING_TEXT } from "../components/use-verify";
import { COURT_RULES_LONG } from "../courts/links";
import { writeHandover } from "../handover";
import { defaultServices } from "../services";
import type { AppServices } from "../services";
import { CheckResults } from "./check-results";
import { INITIAL_CHECK_STATE, reduceCheck } from "./check-state";
import type { CheckState } from "./check-state";
import {
  CHECK_TITLE,
  HANDOVER_FAILED,
  PRIVACY_SENTENCE,
  STORAGE_STATEMENT,
  STORAGE_STATEMENT_WIDE,
  VERIFYING_TEXT,
  WHAT_IT_DOES,
} from "./check-text";
import { useCheckRun } from "./use-check-run";
import { useDraftInput } from "./use-draft-input";
import { useWide } from "./use-wide";

type Styles = Readonly<Record<string, string>>;

function EditorLink({
  svc,
  text,
  styles,
  wide,
  onFail,
}: Readonly<{
  svc: AppServices;
  text: string;
  styles: Styles;
  wide: boolean;
  onFail: (message: string) => void;
}>) {
  if (!wide || text === "") return null;
  const onClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    if (writeHandover(svc.session, docxSafe(text).text)) return;
    e.preventDefault();
    onFail(HANDOVER_FAILED);
  };
  return (
    <p className={styles["links"]}>
      <a href="/" onClick={onClick}>
        Open this draft in the editor
      </a>
    </p>
  );
}

function statusText(running: null | Readonly<{ waiting: boolean }>): React.JSX.Element | null {
  if (running === null) return null;
  return <p>{running.waiting ? WAITING_TEXT : VERIFYING_TEXT}</p>;
}

type Actions = ReturnType<typeof useDraftInput>;

function PageTop({ styles, wide }: Readonly<{ styles: Styles; wide: boolean }>): React.JSX.Element {
  return (
    <>
      <header className={styles["header"]}>
        <a href="/" className={styles["brand"]}>
          <Mark />
          <span className={styles["wordmark"]}>Reveal Codes</span>
        </a>
      </header>
      <h1 className={styles["title"]}>{CHECK_TITLE}</h1>
      <p>{WHAT_IT_DOES}</p>
      <p>{PRIVACY_SENTENCE}</p>
      <p>{wide ? STORAGE_STATEMENT_WIDE : STORAGE_STATEMENT}</p>
    </>
  );
}

function PageLinks({ styles }: Readonly<{ styles: Styles }>): React.JSX.Element {
  return (
    <p className={styles["links"]}>
      <a href="/courts">{COURT_RULES_LONG}</a>
      <a href="/">Open the editor</a>
    </p>
  );
}
function DraftBox({
  text,
  styles,
  onEdit,
}: Readonly<{ text: string; styles: Styles; onEdit: (text: string) => void }>) {
  return (
    <div className={styles["group"]}>
      <label htmlFor="check-draft" className={styles["fieldLabel"]}>
        Your draft
      </label>
      <textarea
        id="check-draft"
        className={styles["draft"]}
        rows={12}
        value={text}
        onChange={(e) => {
          onEdit(e.target.value);
        }}
      />
    </div>
  );
}

function ActionRow(
  props: Readonly<{
    busy: boolean;
    styles: Styles;
    input: Actions;
    onCheck: () => void;
    onClear: () => void;
  }>,
) {
  const { input } = props;
  return (
    <div className={`${props.styles["group"] ?? ""} ${props.styles["actions"] ?? ""}`}>
      <button type="button" data-primary="true" disabled={props.busy} onClick={props.onCheck}>
        Check citations
      </button>
      <button type="button" onClick={input.onOpen}>
        Open a file
      </button>
      <button type="button" onClick={input.onSample}>
        Load the Avianca citations
      </button>
      <button type="button" onClick={props.onClear}>
        Clear
      </button>
      <input type="file" hidden aria-label="Open a draft file" {...input.openInput} />
    </div>
  );
}

type RegionProps = Readonly<{
  svc: AppServices;
  state: CheckState;
  styles: Styles;
  messages: readonly (string | null)[];
  onAgain: () => void;
}>;

function StatusRegion({ svc, state, styles, messages, onAgain }: RegionProps) {
  const mode = useModeResult(svc.api).mode;
  return (
    <div role="status" className={styles["group"]}>
      {statusText(state.running)}
      {messages.map((m) => (m === null ? null : <p key={m}>{m}</p>))}
      {mode === "fixtures" ? <p>{DEMO_MODE_LINE}</p> : null}
      {state.results === null ? null : (
        <CheckResults
          results={state.results}
          stale={state.stale}
          running={state.running !== null}
          svc={svc}
          classes={styles}
          onAgain={onAgain}
        />
      )}
    </div>
  );
}

function useCheckPage(services: AppServices | undefined) {
  const [svc] = useState<AppServices>(() => services ?? defaultServices());
  const [state, dispatch] = useReducer(reduceCheck, INITIAL_CHECK_STATE);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useDraftInput(state, dispatch, svc);
  const run = useCheckRun(svc, state, dispatch);
  return {
    svc,
    state,
    input,
    run,
    setNotice,
    messages: [state.message, input.inputMessage, state.openNote, notice],
    onEdit: (text: string): void => {
      dispatch({ type: "edit", text });
    },
    onClear: (): void => {
      run.stopWaiting();
      setNotice(null);
      input.onClear();
    },
  };
}

/** Page for `/check`: paste or open a draft, check its citations, read the results. Nothing is stored. */
export function CheckPage({
  services,
  styles,
}: Readonly<{ services?: AppServices; styles: Styles }>): React.JSX.Element {
  const page = useCheckPage(services);
  const { svc, state, input, run } = page;
  const wide = useWide(svc);
  return (
    <div className={styles["desk"]}>
      <main className={styles["page"]}>
        <PageTop styles={styles} wide={wide} />
        <DraftBox text={state.text} styles={styles} onEdit={page.onEdit} />
        <ActionRow
          busy={state.running !== null}
          styles={styles}
          input={input}
          onCheck={run.onCheck}
          onClear={page.onClear}
        />
        <StatusRegion
          svc={svc}
          state={state}
          styles={styles}
          messages={page.messages}
          onAgain={run.onCheck}
        />
        <EditorLink
          svc={svc}
          text={state.text}
          styles={styles}
          wide={wide && !state.stale}
          onFail={page.setNotice}
        />
        <PageLinks styles={styles} />
        {input.dialog}
      </main>
    </div>
  );
}
