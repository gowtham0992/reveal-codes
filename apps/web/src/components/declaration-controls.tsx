"use client";

import { choiceAiLabel, choiceNoneLabel, TOOL_NAME_LINE } from "@reveal-codes/export";
import styles from "./declaration-controls.module.css";
import { useDeclaration } from "./use-declaration";
import type { UseDeclarationInput } from "./use-declaration";

const LINE_ID = "declaration-tool-line";

/**
 * The Declaration question (Requirement 3): two native radios with none selected, and a
 * Tool_Name field on the second choice. Mount with key={subject}.
 */
export function DeclarationControls(props: UseDeclarationInput) {
  const view = useDeclaration(props);
  const { subject, choice, toolText, toolFault } = view;
  const showAi = choice === "declared_ai";
  const showLine = showAi && (toolText.trim() === "" || toolFault !== null);
  return (
    <fieldset className={styles["group"]}>
      <legend className={styles["legend"]}>Generative AI</legend>
      <label className={styles["choice"]}>
        <input
          type="radio"
          name="declaration"
          className={styles["radio"]}
          checked={choice === "none"}
          onChange={() => {
            view.setChoice("none");
          }}
        />
        {choiceNoneLabel(subject)}
      </label>
      <label className={styles["choice"]}>
        <input
          type="radio"
          name="declaration"
          className={styles["radio"]}
          checked={showAi}
          onChange={() => {
            view.setChoice("declared_ai");
          }}
        />
        {choiceAiLabel(subject)}
      </label>
      {showAi ? (
        <div className={styles["tool"]}>
          <label htmlFor="declaration-tool-name">Tool name</label>
          <input
            id="declaration-tool-name"
            type="text"
            className={styles["toolInput"]}
            value={toolText}
            aria-describedby={showLine ? LINE_ID : undefined}
            aria-invalid={showLine}
            onChange={(event) => {
              view.setToolText(event.currentTarget.value);
            }}
          />
          {showLine ? (
            <p id={LINE_ID} className={styles["line"]}>
              {TOOL_NAME_LINE}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
