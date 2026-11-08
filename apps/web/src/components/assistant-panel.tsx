"use client";

import { useState } from "react";
import { PROMPT_LIMIT, disclosure } from "../assistant-run";
import type { AssistantInfo } from "../client/api";
import styles from "./assistant-panel.module.css";
import type { AssistantRun } from "./use-assistant";

export type AssistantPanelProps = Readonly<{ info: AssistantInfo; run: AssistantRun }>;

/** Prompt box, Draft or Stop, streaming text area and the disclosure line (Requirement 23.1). */
export function AssistantPanel({ info, run }: AssistantPanelProps) {
  const [prompt, setPrompt] = useState("");
  return (
    <aside aria-labelledby="assistant-heading" className={styles["panel"]}>
      <h2 id="assistant-heading" className={styles["heading"]}>
        Assistant
      </h2>
      <p className={styles["note"]}>{disclosure(info)}</p>
      <label htmlFor="assistant-prompt" className={styles["label"]}>
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
      <DraftButton run={run} prompt={prompt} />
      <div role="log" aria-live="off" aria-label="Streamed reply" className={styles["stream"]}>
        {run.text}
      </div>
      {run.message === null ? null : <p className={styles["error"]}>{run.message}</p>}
    </aside>
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
