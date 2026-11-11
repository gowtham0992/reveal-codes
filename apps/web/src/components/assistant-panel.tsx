"use client";

import { useState } from "react";
import { PROMPT_LIMIT, disclosure } from "../assistant-run";
import type { AssistantInfo } from "../client/api";
import styles from "./assistant-panel.module.css";
import type { AssistantRun } from "./use-assistant";

export type AssistantPanelProps = Readonly<{
  info: AssistantInfo;
  run: AssistantRun;
  /** The cursor as `Ln <l> Pos <c>`. */
  position: string;
}>;

/** Prompt box, Draft or Stop, the Reply_Box and the disclosure line (Requirement 23.1). */
export function AssistantPanel({ info, run, position }: AssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  return (
    <aside aria-labelledby="assistant-heading" className={styles["panel"]}>
      <h2 id="assistant-heading" className={styles["heading"]}>
        Assistant
      </h2>
      <div className={styles["body"]}>
        <p className={styles["note"]}>{disclosure(info)}</p>
        <label htmlFor="assistant-prompt" className={`small-label ${styles["label"] ?? ""}`}>
          Prompt
        </label>
        <textarea
          id="assistant-prompt"
          className={styles["prompt"]}
          rows={4}
          maxLength={PROMPT_LIMIT}
          value={prompt}
          disabled={run.streaming}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
        />
        <p className={styles["note"]}>Inserts at the cursor: {position}</p>
        <DraftButton run={run} prompt={prompt} />
        {run.started ? <ReplyBox run={run} /> : null}
        {run.message === null ? null : <p className={styles["error"]}>{run.message}</p>}
      </div>
    </aside>
  );
}

function ReplyBox({ run }: Readonly<{ run: AssistantRun }>) {
  const { inserted } = run;
  return (
    <>
      <span id="assistant-reply-label" className={`small-label ${styles["label"] ?? ""}`}>
        Last reply
      </span>
      <div
        role="log"
        aria-live="off"
        aria-labelledby="assistant-reply-label"
        className={styles["stream"]}
      >
        {run.text}
      </div>
      {inserted === null ? null : (
        <p className={styles["note"]}>
          {inserted.stopped ? "Stopped. Partial reply inserted" : "Inserted"} at Ln {inserted.line}{" "}
          as run {inserted.runId}
        </p>
      )}
    </>
  );
}

function DraftButton({ run, prompt }: Readonly<{ run: AssistantRun; prompt: string }>) {
  if (run.streaming) {
    return (
      <button type="button" onClick={run.stop}>
        Stop
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={prompt.trim() === ""}
      onClick={() => {
        run.start(prompt);
      }}
    >
      Draft
    </button>
  );
}
